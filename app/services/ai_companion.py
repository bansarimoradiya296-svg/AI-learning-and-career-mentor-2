import asyncio
import io
import json
import os
import re
import uuid
from datetime import datetime, timedelta
from typing import Dict, List, Optional

from pypdf import PdfReader
import docx
from pptx import Presentation
import google.generativeai as genai
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import BadRequestError
from app.models.study import Document, Flashcard, Quiz, Question, QuizResult
from app.services.rag_engine import rag_engine

# Initialize Gemini safely
try:
    if settings.GEMINI_API_KEY:
        genai.configure(api_key=settings.GEMINI_API_KEY)
except Exception:
    pass


class AICompanionService:
    def __init__(self, db: AsyncSession):
        self.db = db

    def extract_text_from_file(self, file_path: str, file_type: str) -> str:
        """Parses PDF, Word, PowerPoint or text documents to extract raw text."""
        text = ""
        file_type = file_type.lower()
        
        try:
            if "pdf" in file_type:
                reader = PdfReader(file_path)
                for page in reader.pages:
                    text += (page.extract_text() or "") + "\n"
            elif "docx" in file_type or "document" in file_type:
                doc = docx.Document(file_path)
                text = "\n".join([p.text for p in doc.paragraphs])
            elif "pptx" in file_type or "presentation" in file_type:
                prs = Presentation(file_path)
                for slide in prs.slides:
                    for shape in slide.shapes:
                        if hasattr(shape, "text"):
                            text += shape.text + "\n"
            else: # Fallback to plaintext
                with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                    text = f.read()
        except Exception as e:
            raise BadRequestError(f"Error parsing uploaded file: {str(e)}")
            
        if not text.strip():
            raise BadRequestError("Uploaded file contains no readable text content.")
            
        return text

    def chunk_text(self, text: str, chunk_size: int = 800, overlap: int = 150) -> List[str]:
        """Splits raw text into sliding window chunks for vector indexing."""
        chunks = []
        words = text.split()
        
        # Approximate chunk size by word length (1 word ~ 5 characters)
        words_per_chunk = chunk_size // 5
        words_overlap = overlap // 5
        
        if len(words) <= words_per_chunk:
            return [text]

        i = 0
        while i < len(words):
            chunk_words = words[i: i + words_per_chunk]
            chunks.append(" ".join(chunk_words))
            i += (words_per_chunk - words_overlap)
            
        return chunks

    async def ingest_document(
        self, 
        document_id: uuid.UUID, 
        generate_short: bool = True, 
        generate_detailed: bool = True, 
        generate_notes: bool = True,
        generate_flashcards: bool = True,
        generate_quiz: bool = True
    ) -> None:
        """
        Parses document, chunks it, generates vector embeddings, and dynamically generates summaries, exam notes, flashcards & quiz.
        Uses an isolated DB session context to safely run in FastAPI background tasks.
        """
        from app.core.database import AsyncSessionLocal
        
        async with AsyncSessionLocal() as session:
            result = await session.execute(select(Document).filter(Document.id == document_id))
            document = result.scalars().first()
            if not document:
                print(f"Document {document_id} not found for ingestion.")
                return

            try:
                text = self.extract_text_from_file(document.file_path, document.file_type)
                chunks = self.chunk_text(text)
                
                # Prepare Chroma payloads
                documents_list = []
                metadatas = []
                ids = []
                
                collection_name = f"user_docs_{document.user_id}"
                
                for idx, chunk in enumerate(chunks):
                    documents_list.append(chunk)
                    metadatas.append({
                        "document_id": str(document.id),
                        "file_name": document.file_name,
                        "chunk_index": idx
                    })
                    ids.append(f"doc_{document.id}_chunk_{idx}")

                # Push to ChromaDB
                success = await rag_engine.add_documents(
                    collection_name=collection_name,
                    documents=documents_list,
                    metadatas=metadatas,
                    ids=ids
                )
                
                if success:
                    document.embedding_status = "SUCCESS"
                else:
                    document.embedding_status = "FAILED"

                # Optional AI Note Generation
                if generate_short or generate_detailed or generate_notes:
                    await self._generate_document_notes_internal(document, text, generate_short, generate_detailed, generate_notes)

                session.add(document)
                await session.commit()

                # Dynamic Flashcard & Quiz generation
                svc = AICompanionService(session)
                if generate_flashcards:
                    await svc.generate_flashcards(document_id=document.id, user_id=document.user_id, text=text)
                if generate_quiz:
                    await svc.generate_quiz(document_id=document.id, difficulty="MEDIUM", text=text)

            except Exception as e:
                print(f"Error ingesting document {document.id}: {e}")
                document.embedding_status = "FAILED"
                session.add(document)
                await session.commit()

    async def _generate_document_notes_internal(
        self, 
        document: Document, 
        text: str, 
        generate_short: bool = True, 
        generate_detailed: bool = True, 
        generate_notes: bool = True
    ) -> None:
        """Internal helper to call Gemini for generating Short Summary, Detailed Notes, and Exam Notes with fallbacks."""
        sample_text = text[:15000]
        sentences = [s.strip() for s in text.replace("\n", " ").split(".") if len(s.strip()) > 20]
        is_mock_key = not settings.GEMINI_API_KEY or "mock_key" in settings.GEMINI_API_KEY

        candidate_models = [settings.GEMINI_MODEL, "gemini-flash-latest", "gemini-1.5-flash", "gemini-2.0-flash"]
        seen_models = set()
        models_to_try = [m for m in candidate_models if m and not (m in seen_models or seen_models.add(m))]

        async def _call_gemini(prompt: str) -> Optional[str]:
            if is_mock_key:
                return None
            for model_name in models_to_try:
                try:
                    model = genai.GenerativeModel(model_name)
                    res = await asyncio.to_thread(model.generate_content, prompt)
                    if res and res.text:
                        return res.text.strip()
                except Exception as e:
                    print(f"Note gen error with model {model_name}: {e}")
                    continue
            return None

        if generate_short:
            prompt = (
                f"You are a top academic professor. Create a concise, high-impact Executive Summary (2-3 paragraphs) "
                f"for the following material. Highlight the core purpose, essential principles, and practical relevance using clean Markdown:\n\n{sample_text}"
            )
            ai_res = await _call_gemini(prompt)
            if ai_res:
                document.short_summary = ai_res
            else:
                lead_text = ". ".join(sentences[:5]) + "." if len(sentences) >= 5 else sample_text[:500]
                document.short_summary = f"### Executive Summary\n\n{lead_text}\n\n*Comprehensive overview generated from {document.file_name}.*"

        if generate_detailed:
            prompt = (
                f"Create an in-depth, structured study breakdown of this material. "
                f"Include:\n"
                f"1. Major Topic Overview\n"
                f"2. Core Concepts & Definitions (with bold terms)\n"
                f"3. Key Methodologies / Step-by-Step Mechanisms\n"
                f"4. Real-world Applications & Examples\n"
                f"Format cleanly in Markdown with headers and bullet points:\n\n{sample_text}"
            )
            ai_res = await _call_gemini(prompt)
            if ai_res:
                document.detailed_summary = ai_res
            else:
                bullets = "\n".join([f"- **Concept {i+1}**: {s}." for i, s in enumerate(sentences[5:15])]) if len(sentences) >= 15 else "- **Key Topic**: Review foundational document contents."
                document.detailed_summary = f"### Comprehensive Topic Breakdown\n\n#### Core Concepts & Principles:\n\n{bullets}"

        if generate_notes:
            prompt = (
                f"Create high-yield Exam Revision Cram Notes for students preparing for tests. "
                f"Include:\n"
                f"- ⚡ High-Yield Key Formulas & Principles\n"
                f"- 🎯 Top 5 Likely Exam Questions & Brief Answers\n"
                f"- ⚠️ Common Pitfalls & Edge Cases to Avoid\n"
                f"- 💡 Rapid Recall Cheat Sheet Points\n"
                f"Format in clean Markdown:\n\n{sample_text}"
            )
            ai_res = await _call_gemini(prompt)
            if ai_res:
                document.exam_notes = ai_res
            else:
                exam_bullets = "\n".join([f"- **High-Yield Point {idx+1}**: {s}." for idx, s in enumerate(sentences[15:22])]) if len(sentences) >= 22 else "- **Key Formula / Law**: Core principles extracted from course document."
                document.exam_notes = f"### High-Yield Exam Cram Notes\n\n#### Critical Revision Points:\n\n{exam_bullets}\n\n💡 **Exam Strategy**: Focus on core definitions and step-by-step algorithms."


    async def generate_notes_for_document(self, document_id: uuid.UUID) -> Document:
        """Triggers complete Note Generation (Short, Detailed, Exam Notes) for an existing document."""
        result = await self.db.execute(select(Document).filter(Document.id == document_id))
        document = result.scalars().first()
        if not document:
            raise BadRequestError("Document not found")

        text = self.extract_text_from_file(document.file_path, document.file_type)
        await self._generate_document_notes_internal(document, text, generate_short=True, generate_detailed=True, generate_notes=True)
        self.db.add(document)
        await self.db.commit()
        await self.db.refresh(document)
        return document

    async def ask_document_rag(self, user_id: uuid.UUID, query: str, document_ids: Optional[List[uuid.UUID]] = None) -> str:
        """
        Retrieves context chunks from vector store or loaded documents, and answers user questions using Gemini with fallback.
        """
        collection_name = f"user_docs_{user_id}"
        relevant_chunks = await rag_engine.query_documents(collection_name, query, n_results=5)
        
        context = ""
        for chunk in relevant_chunks:
            context += f"--- Source: {chunk['metadata'].get('file_name', 'Document')} ---\n{chunk['document']}\n\n"

        # If vector collection has no results, retrieve directly from user's uploaded documents in DB
        if not context.strip():
            stmt = select(Document).filter(Document.user_id == user_id)
            if document_ids:
                stmt = stmt.filter(Document.id.in_(document_ids))
            stmt = stmt.order_by(Document.created_at.desc()).limit(3)
            
            res = await self.db.execute(stmt)
            user_docs = res.scalars().all()
            for doc in user_docs:
                raw_text = self.extract_text_from_file(doc.file_path, doc.file_type)
                if raw_text:
                    context += f"--- Source: {doc.file_name} ---\n{raw_text[:8000]}\n\n"

        if not context.strip():
            return "No uploaded documents found. Please upload a study document first."

        prompt = (
            f"You are a world-class AI Learning Mentor and Academic Tutor.\n"
            f"A student has asked the following question regarding their uploaded study material.\n\n"
            f"--- Uploaded Course Material / Document Context ---\n{context}\n\n"
            f"--- Student Question ---\n{query}\n\n"
            f"--- Formatting Requirements ---\n"
            f"1. Structure your answer clearly using Markdown with crisp sections.\n"
            f"2. Begin with a concise, direct answer / definition (1-2 sentences in bold/highlight).\n"
            f"3. Use bullet points (`- `) with **bold keywords** for key points, steps, characteristics, or principles.\n"
            f"4. If formulas, code snippets, or algorithms apply, format them in clean code blocks.\n"
            f"5. Conclude with a brief '💡 Key Takeaway' summary.\n"
            f"6. Do NOT dump raw unprocessed text. Make the explanation intuitive, rigorous, and visually organized."
        )

        is_mock_key = not settings.GEMINI_API_KEY or "mock_key" in settings.GEMINI_API_KEY
        if not is_mock_key:
            candidate_models = [settings.GEMINI_MODEL, "gemini-flash-latest", "gemini-1.5-flash", "gemini-2.0-flash"]
            # Deduplicate preserving order
            seen_models = set()
            models_to_try = [m for m in candidate_models if m and not (m in seen_models or seen_models.add(m))]

            for model_name in models_to_try:
                try:
                    model = genai.GenerativeModel(model_name)
                    response = await asyncio.to_thread(model.generate_content, prompt)
                    if response and response.text:
                        return response.text.strip()
                except Exception as e:
                    print(f"Gemini RAG query error with model '{model_name}': {e}")
                    continue


        # Fallback: Extract relevant matching sentences directly from document context and structure cleanly
        query_words = [w.lower().strip() for w in query.split() if len(w.strip()) > 2]
        lines = [line.strip() for line in context.splitlines() if len(line.strip()) > 15 and not line.startswith("---")]
        
        matching = []
        for line in lines:
            if any(qw in line.lower() for qw in query_words):
                matching.append(line)

        if matching:
            unique_matches = list(dict.fromkeys(matching))[:5]
            bullets = "\n".join([f"- **Key Point {i+1}**: {m}" for i, m in enumerate(unique_matches)])
            return f"### Core Explanation\n\nBased on your uploaded course documents:\n\n{bullets}\n\n💡 **Key Takeaway**: Review the corresponding chapter in your notes for further details."
        else:
            unique_lines = list(dict.fromkeys(lines))[:4]
            bullets = "\n".join([f"- {l}" for l in unique_lines])
            return f"### Document Context\n\nHere are the most relevant sections identified from your material:\n\n{bullets if bullets else 'Material verified.'}"


    async def get_concept_mastery_map(self, user_id: uuid.UUID) -> dict:
        """
        Retrieves actual mastery percentages per concept based on quiz results and flashcard reviews.
        """
        mastery_map = {}
        try:
            fc_stmt = select(Flashcard).filter(Flashcard.user_id == user_id)
            fc_res = await self.db.execute(fc_stmt)
            for fc in fc_res.scalars().all():
                if fc.concept and fc.attempt_count > 0:
                    key = fc.concept.strip().lower()
                    mastery_map[key] = round((fc.correct_count / fc.attempt_count) * 100)
            
            qr_stmt = select(QuizResult).filter(QuizResult.user_id == user_id).options(selectinload(QuizResult.quiz))
            qr_res = await self.db.execute(qr_stmt)
            for r in qr_res.scalars().all():
                if r.total_questions > 0 and r.quiz:
                    key = r.quiz.title.replace("Quiz -", "").strip().lower()
                    pct = round((r.score / r.total_questions) * 100)
                    mastery_map[key] = pct
        except Exception as e:
            print(f"Error building mastery map: {e}")
        return mastery_map

    async def generate_mindmap(self, topic: str, user_id: uuid.UUID) -> dict:
        return await self.generate_mindmap_full(source_type="TOPIC", topic=topic, user_id=user_id)

    async def generate_mindmap_full(
        self, 
        source_type: str, 
        topic: Optional[str] = None, 
        text: Optional[str] = None, 
        document_id: Optional[uuid.UUID] = None,
        user_id: Optional[uuid.UUID] = None
    ) -> dict:
        """
        Generates a rich, interactive Concept Graph Mind Map JSON with hierarchical nodes,
        importance levels, relationships, definitions, and real mastery data.
        """
        doc_name = topic or "Learning Content"
        content_text = text or ""

        if document_id:
            res = await self.db.execute(select(Document).filter(Document.id == document_id))
            doc = res.scalars().first()
            if doc:
                doc_name = doc.file_name
                content_text = self.extract_text_from_file(doc.file_path, doc.file_type)

        mastery_map = {}
        if user_id:
            mastery_map = await self.get_concept_mastery_map(user_id)

        sample_text = content_text[:12000] if content_text else f"Topic: {doc_name}"

        prompt = (
            f"You are an expert AI Educator. Build a comprehensive, hierarchical concept mind map from the provided material for '{doc_name}'.\n"
            f"IMPORTANT: Extract the exact topics, units, chapters, and core concepts directly present in the provided material.\n"
            f"Analyze the content and output ONLY a valid JSON object with 'title', 'nodes', and 'relationships'.\n\n"
            f"Node object requirements:\n"
            f"- 'id': unique string (e.g. 'root', 'node-1')\n"
            f"- 'name': short concept title extracted from material\n"
            f"- 'definition': 1-2 sentence core summary from material\n"
            f"- 'detailed_explanation': thorough paragraph\n"
            f"- 'importance': 'High', 'Medium', or 'Low'\n"
            f"- 'parent_id': id of parent node or null for root\n"
            f"- 'related': array of string names of 2-3 related concepts\n\n"
            f"Relationships list items: {{'from': 'node-id', 'to': 'node-id', 'type': 'Parent-Child' | 'Depends On' | 'Related To' | 'Leads To'}}\n"
            f"Return ONLY valid raw JSON text. No markdown blocks.\n"
            f"Material:\n{sample_text}"
        )

        mindmap_data = None
        is_mock_key = not settings.GEMINI_API_KEY or "mock_key" in settings.GEMINI_API_KEY

        if not is_mock_key:
            try:
                model = genai.GenerativeModel(settings.GEMINI_MODEL)
                response = await asyncio.to_thread(model.generate_content, prompt)
                raw_json = response.text.replace("```json", "").replace("```", "").strip()
                mindmap_data = json.loads(raw_json)
            except Exception as e:
                print(f"Gemini mindmap generation error: {e}")

        if not mindmap_data or "nodes" not in mindmap_data:
            mindmap_data = self._generate_fallback_mindmap_structure(doc_name, content_text)

        # Attach real student performance mastery & revision status to each node
        for node in mindmap_data.get("nodes", []):
            node_key = node["name"].strip().lower()
            if node_key in mastery_map:
                node["mastery"] = mastery_map[node_key]
                node["status"] = "Needs Revision" if node["mastery"] < 60 else "Mastered"
            else:
                # If no quiz/flashcard activity exists, display null for "Not enough data"
                node["mastery"] = None
                node["status"] = "Learning"

        return mindmap_data

    def _generate_fallback_mindmap_structure(self, title: str, text: str) -> dict:
        """Fallback smart mindmap structure extracted directly from document text or topic."""
        root_name = title.replace(".pdf", "").replace(".docx", "").replace(".txt", "").strip() or "Study Topic"
        sub_topics_data = []

        if text and len(text.strip()) > 15:
            raw_lines = [l.strip() for l in text.split("\n") if len(l.strip()) > 3]
            extracted_concepts = []

            for line in raw_lines:
                clean_l = re.sub(r'^[0-9\.\-\:\#\*\•\>]+', '', line).strip()
                if not clean_l or len(clean_l) < 3:
                    continue
                
                parts = re.split(r'\:|\-|\–|\—', clean_l, maxsplit=1)
                if len(parts) == 2 and len(parts[0].strip()) >= 3 and len(parts[0].strip()) <= 50:
                    c_title = parts[0].strip().title()
                    c_def = parts[1].strip()
                    c_exp = f"Detailed technical breakdown of {c_title}: {c_def}"
                    if c_title.lower() not in [c[0].lower() for c in extracted_concepts]:
                        extracted_concepts.append((c_title, c_def[:120], c_exp))
                elif len(clean_l) <= 60:
                    c_title = clean_l.title()
                    c_def = f"Core concept extracted directly from {root_name} resource material."
                    c_exp = f"Detailed concept overview and principles of {c_title} as covered in the study text."
                    if c_title.lower() not in [c[0].lower() for c in extracted_concepts]:
                        extracted_concepts.append((c_title, c_def, c_exp))
                else:
                    words = [w for w in clean_l.split() if len(w) > 1]
                    if len(words) >= 3:
                        c_title = " ".join(words[:min(6, len(words))]).title()
                        c_title = re.sub(r'^[0-9\.\-\:\#\*\•\>]+', '', c_title).strip()
                        c_def = clean_l[:120] + ("..." if len(clean_l) > 120 else "")
                        c_exp = f"Detailed study notes on {c_title}: {clean_l}"
                        if len(c_title) > 3 and c_title.lower() not in [c[0].lower() for c in extracted_concepts]:
                            extracted_concepts.append((c_title, c_def, c_exp))

            if extracted_concepts:
                sub_topics_data = extracted_concepts[:10]

        if not sub_topics_data:
            lower_t = root_name.lower()
            if "network" in lower_t:
                sub_topics_data = [
                    ("OSI & TCP/IP Model", "7-layer ISO OSI architecture and 4-layer TCP/IP protocol suite.", "Defines standardized networking abstractions for data encapsulation from Physical to Application layers."),
                    ("Transport Layer (TCP/UDP)", "Reliable stream transport vs connectionless datagram delivery.", "TCP handles flow control (sliding window), congestion control, and 3-way handshake; UDP provides low-latency transmission."),
                    ("Network Layer & IP Routing", "Logical IP addressing, subnet masking, and routing protocols.", "Includes IPv4/IPv6 packet header parsing, CIDR subnets, BGP, OSPF, and router packet forwarding tables."),
                    ("Data Link & Wireless", "MAC framing, Ethernet switches, and CSMA/CD access.", "Manages physical address resolution (ARP), VLAN tagging, frame error detection (CRC), and wireless Wi-Fi standards.")
                ]
            elif "operating system" in lower_t or "os" in lower_t:
                sub_topics_data = [
                    ("Process & Thread Management", "Concurrency, PCB scheduling, and thread execution.", "Covers CPU scheduling algorithms (RR, SJF, Multilevel Queue), context switches, and inter-process communication (IPC)."),
                    ("Memory & Virtual Paging", "Physical RAM allocation, virtual memory, and page replacement.", "Explains MMU address translation, page tables, TLB cache hits, demand paging, and page fault algorithms (LRU, FIFO)."),
                    ("Storage & File Systems", "Block storage, inode file indexing, and disk I/O scheduling.", "Details file descriptors, directory trees, journaling (ext4/NTFS), and disk scheduling algorithms (SSTF, SCAN)."),
                    ("Synchronization & Deadlocks", "Mutex locks, semaphores, and Coffman deadlock conditions.", "Analyzes critical section problems, race conditions, atomic operations, and Banker's deadlock avoidance algorithm.")
                ]
            elif "data" in lower_t or "dbms" in lower_t or "sql" in lower_t or "database" in lower_t:
                sub_topics_data = [
                    ("Relational Data Modeling", "Entity-Relationship schemas and Relational Algebra.", "Defines primary/foreign keys, ER diagrams, tuple relational calculus, and SQL DDL/DML query execution."),
                    ("Normalization & Normal Forms", "Database decomposition rules to eliminate data redundancy.", "Walks through 1NF, 2NF, 3NF, and BCNF functional dependencies and lossless join decompositions."),
                    ("ACID Transactions", "Atomicity, Consistency, Isolation, and Durability guarantees.", "Covers WAL (Write-Ahead Logging), 2PL (Two-Phase Locking), serializability, and transaction rollback recovery."),
                    ("Indexing & Query Tuning", "B+ Tree index trees and query execution plan optimization.", "Explains primary vs secondary indices, hash indexes, full table scans, and index seek selectivity.")
                ]
            else:
                sub_topics_data = [
                    (f"Foundations of {root_name}", f"Core framework and essential principles of {root_name}.", f"Establishes the fundamental domain knowledge, key terminology, and theoretical background required for {root_name}."),
                    (f"Architecture & Mechanics", f"Structural components and internal workflow mechanics.", f"Deep dive into system components, data flows, operational constraints, and architectural patterns of {root_name}."),
                    (f"Implementation & Execution", f"Practical execution, protocols, and implementation patterns.", f"Covers implementation strategies, best practices, real-world case studies, and engineering workflows for {root_name}."),
                    (f"Optimization & Future Trends", f"Performance tuning, evaluation metrics, and future advances.", f"Analyzes efficiency benchmarks, scalability bottlenecks, algorithmic trade-offs, and upcoming advances in {root_name}.")
                ]

        nodes = [
            {
                "id": "root",
                "name": root_name,
                "definition": f"Master concept map for {root_name}.",
                "detailed_explanation": f"Comprehensive hierarchical breakdown of {root_name}, organizing key modules, sub-concepts, and dependency links for structured learning.",
                "importance": "High",
                "parent_id": None,
                "related": [s[0] for s in sub_topics_data[:3]]
            }
        ]

        relationships = []

        for idx, (sub_title, sub_def, sub_exp) in enumerate(sub_topics_data):
            sub_id = f"sub-{idx+1}"
            nodes.append({
                "id": sub_id,
                "name": sub_title,
                "definition": sub_def,
                "detailed_explanation": sub_exp,
                "importance": "High" if idx % 2 == 0 else "Medium",
                "parent_id": "root",
                "related": [root_name]
            })
            relationships.append({"from": "root", "to": sub_id, "type": "Parent-Child"})

            # Topic-aware child nodes
            child_1_title = f"{sub_title} - Fundamentals"
            child_2_title = f"{sub_title} - Advanced Practice"
            
            child_1_id = f"child-{idx+1}-1"
            child_2_id = f"child-{idx+1}-2"

            nodes.append({
                "id": child_1_id,
                "name": child_1_title,
                "definition": f"Core principles and basic building blocks of {sub_title}.",
                "detailed_explanation": f"Focuses on basic terminology, foundational rules, and key mechanisms underlying {sub_title}.",
                "importance": "Medium",
                "parent_id": sub_id,
                "related": [sub_title]
            })
            relationships.append({"from": sub_id, "to": child_1_id, "type": "Parent-Child"})

            nodes.append({
                "id": child_2_id,
                "name": child_2_title,
                "definition": f"Complex problem solving and edge cases in {sub_title}.",
                "detailed_explanation": f"Advanced problem-solving scenarios, failure recovery, performance trade-offs, and practical design challenges in {sub_title}.",
                "importance": "Low",
                "parent_id": sub_id,
                "related": [child_1_title]
            })
            relationships.append({"from": sub_id, "to": child_2_id, "type": "Parent-Child"})
            relationships.append({"from": child_1_id, "to": child_2_id, "type": "Leads To"})

        return {
            "title": f"Mind Map - {root_name}",
            "nodes": nodes,
            "relationships": relationships
        }

    async def expand_mindmap_node(self, concept_name: str, parent_context: Optional[str] = None) -> List[dict]:
        """
        Dynamically generates 3-4 new child sub-concepts for a selected node using AI.
        """
        prompt = (
            f"Generate 3 to 4 specific sub-concepts to expand the mind map node: '{concept_name}'.\n"
            f"Context: {parent_context or concept_name}.\n"
            f"Return ONLY a JSON list of objects matching:\n"
            f'[{{"name": "Subconcept Name", "definition": "1 sentence definition", "detailed_explanation": "Detailed paragraph", "importance": "High/Medium/Low"}}]\n'
            f"No markdown formatting."
        )

        is_mock_key = not settings.GEMINI_API_KEY or "mock_key" in settings.GEMINI_API_KEY
        if not is_mock_key:
            try:
                model = genai.GenerativeModel(settings.GEMINI_MODEL)
                res = await asyncio.to_thread(model.generate_content, prompt)
                raw_json = res.text.replace("```json", "").replace("```", "").strip()
                return json.loads(raw_json)
            except Exception as e:
                print(f"Node expansion AI error: {e}")

        # Fallback node expansion
        return [
            {
                "name": f"{concept_name} Types",
                "definition": f"Taxonomy and core classification categories of {concept_name}.",
                "detailed_explanation": f"Categorization framework breaking down {concept_name} into distinct operational patterns.",
                "importance": "High"
            },
            {
                "name": f"{concept_name} Execution",
                "definition": f"Practical application and implementation workflow of {concept_name}.",
                "detailed_explanation": f"Step-by-step procedure for deploying {concept_name} in production environments.",
                "importance": "Medium"
            },
            {
                "name": f"{concept_name} Evaluation",
                "definition": f"Assessment metrics and performance validation for {concept_name}.",
                "detailed_explanation": f"Quantitative criteria and benchmark standards used to measure efficiency of {concept_name}.",
                "importance": "Medium"
            }
        ]

    async def explain_mindmap_node(self, concept_name: str, mode: str, context: Optional[str] = None) -> str:
        """
        Generates dynamic explanations tailored to selected mode:
        Simple Explanation, Detailed Explanation, Exam Explanation, Real-World Example, Technical Explanation.
        """
        prompt = (
            f"Provide an educational explanation of '{concept_name}' in '{mode}' style.\n"
            f"Document Context: {context[:3000] if context else concept_name}\n\n"
            f"Ensure the tone matches '{mode}' accurately and format with clean Markdown headers and bullet points."
        )

        is_mock_key = not settings.GEMINI_API_KEY or "mock_key" in settings.GEMINI_API_KEY
        if not is_mock_key:
            try:
                model = genai.GenerativeModel(settings.GEMINI_MODEL)
                res = await asyncio.to_thread(model.generate_content, prompt)
                if res and res.text:
                    return res.text.strip()
            except Exception as e:
                print(f"Node explanation AI error: {e}")

        # Fallback explanations per mode
        if mode == "Simple Explanation":
            return f"### 💡 Simple Explanation of {concept_name}\n\nThink of **{concept_name}** as a fundamental building block. It organizes complex requirements into clear, manageable steps so you can master the subject effortlessly."
        elif mode == "Exam Explanation":
            return f"### 📝 High-Yield Exam Summary: {concept_name}\n\n- **Key Formula/Rule**: Core principle of {concept_name}.\n- **Potential Question**: What is the primary function of {concept_name}?\n- **Answer**: It defines functional boundaries and system constraints for reliable execution."
        elif mode == "Real-World Example":
            return f"### 🌐 Real-World Example of {concept_name}\n\nIn industry, software engineers use **{concept_name}** when designing scalable web platforms to handle millions of user requests safely without server downtime."
        elif mode == "Technical Explanation":
            return f"### ⚙️ Technical Specification: {concept_name}\n\n- **Architectural Scope**: Distributed component layer.\n- **Complexity**: O(N log N) computational efficiency.\n- **Data Invariants**: Strict non-null memory guarantees and atomic transaction commits."
        else:
            return f"### 📚 Detailed Explanation of {concept_name}\n\n**{concept_name}** establishes complete structural guidelines for learning. It connects foundational theoretical principles with practical engineering methodologies."

    async def generate_flashcards(self, document_id: uuid.UUID, user_id: uuid.UUID, text: Optional[str] = None) -> List[Flashcard]:
        """
        Extracts content from document and generates 5 high-quality, concept-driven flashcards for spaced repetition.
        """
        result = await self.db.execute(select(Document).filter(Document.id == document_id))
        doc = result.scalars().first()
        if not doc:
            raise BadRequestError("Document not found")

        if not text:
            text = self.extract_text_from_file(doc.file_path, doc.file_type)
        sample_text = (text or "")[:12000]

        prompt = (
            f"You are an expert university professor creating study flashcards for a student.\n"
            f"Based on the following learning material, generate 5 clear, high-yield flashcard questions and answers.\n"
            f"Requirements:\n"
            f"- 'front': A complete, grammatically sound question or conceptual query testing a core topic (e.g. 'What is the main advantage of X over Y?'). Never use truncated sentences or ellipses.\n"
            f"- 'back': A clear, direct, and accurate answer explaining the concept in 1-3 sentences.\n"
            f"- Output strictly a JSON array of objects with keys 'front' and 'back'.\n\n"
            f"Document Title: {doc.file_name}\n"
            f"Learning Material:\n{sample_text}"
        )

        is_mock_key = not settings.GEMINI_API_KEY or "mock_key" in settings.GEMINI_API_KEY
        cards = []
        parsed_cards = []

        if not is_mock_key:
            try:
                model = genai.GenerativeModel(settings.GEMINI_MODEL)
                response = await asyncio.to_thread(model.generate_content, prompt)
                raw_text = response.text.strip()
                # Extract JSON array using regex
                match = re.search(r'\[\s*\{.*\}\s*\]', raw_text, re.DOTALL)
                if match:
                    parsed_cards = json.loads(match.group(0))
                else:
                    clean_text = raw_text.replace("```json", "").replace("```", "").strip()
                    parsed_cards = json.loads(clean_text)
            except Exception as e:
                print(f"Gemini flashcard generation error: {e}")
                parsed_cards = []

        # High quality fallback if AI generation didn't return valid cards
        if not parsed_cards or not isinstance(parsed_cards, list):
            doc_topic = doc.file_name.rsplit(".", 1)[0].replace("_", " ").replace("-", " ").title()
            parsed_cards = [
                {
                    "front": f"What is the core purpose and objective of {doc_topic}?",
                    "back": f"{doc_topic} defines foundational principles and operational mechanisms essential for mastering this subject."
                },
                {
                    "front": f"What are the primary components and concepts introduced in {doc_topic}?",
                    "back": f"It covers key definitions, structural relationships, algorithms, and practical applications outlined across the syllabus."
                },
                {
                    "front": f"What are the common practical applications of {doc_topic}?",
                    "back": f"Used extensively in real-world system implementations to ensure efficiency, scalability, and robust performance."
                },
                {
                    "front": f"What key challenges or trade-offs are encountered when working with {doc_topic}?",
                    "back": f"Managing resource constraints, handling edge cases, and balancing performance complexity against implementation simplicity."
                },
                {
                    "front": f"How do you evaluate and verify mastery of {doc_topic}?",
                    "back": f"By testing problem-solving capabilities, analyzing computational complexity, and applying concepts to practical case studies."
                }
            ]

        # Clean existing cards for this doc so fresh cards replace messy ones
        try:
            old_cards_res = await self.db.execute(
                select(Flashcard).filter(Flashcard.document_id == document_id, Flashcard.user_id == user_id)
            )
            for old_c in old_cards_res.scalars().all():
                await self.db.delete(old_c)
            await self.db.flush()
        except Exception:
            pass

        for item in parsed_cards:
            q_text = str(item.get("front") or "").strip()
            a_text = str(item.get("back") or "").strip()
            if not q_text or not a_text:
                continue

            flashcard = Flashcard(
                user_id=user_id,
                document_id=document_id,
                front=q_text,
                back=a_text,
                card_type="CONCEPT",
                difficulty="MEDIUM",
                source="DOCUMENT",
                memory_score=0.0,
                status="NEW",
                attempt_count=0,
                correct_count=0,
                incorrect_count=0,
                ease_factor=2.5,
                interval_days=1,
                next_review_at=datetime.utcnow()
            )
            self.db.add(flashcard)
            cards.append(flashcard)

        await self.db.commit()
        return cards


    async def generate_quiz(self, document_id: uuid.UUID, difficulty: str = "MEDIUM", text: Optional[str] = None) -> Optional[Quiz]:
        """
        Generates a multiple choice quiz based on the document with robust fallback.
        """
        result = await self.db.execute(select(Document).filter(Document.id == document_id))
        doc = result.scalars().first()
        if not doc:
            return None

        if not text:
            text = self.extract_text_from_file(doc.file_path, doc.file_type)
        sample_text = text[:15000]

        prompt = (
            f"Based on the text below, generate 5 multiple choice questions for a quiz at a '{difficulty}' difficulty level.\n"
            f"Return ONLY a JSON object containing a list of questions, formatted like this:\n"
            f'{{"title": "Quiz - {doc.file_name}", "questions": [{{"question_text": "Question?", "options": ["A", "B", "C", "D"], "correct_option": "A", "explanation": "Why correct"}}]}}\n'
            f"Do not wrap in Markdown blocks. Return valid raw JSON text only. Text:\n{sample_text}"
        )

        is_mock_key = not settings.GEMINI_API_KEY or "mock_key" in settings.GEMINI_API_KEY
        quiz_data = None
        if not is_mock_key:
            try:
                model = genai.GenerativeModel(settings.GEMINI_MODEL)
                response = await asyncio.to_thread(model.generate_content, prompt)
                raw_text = response.text.replace("```json", "").replace("```", "").strip()
                quiz_data = json.loads(raw_text)
            except Exception as e:
                print(f"Gemini quiz generation error: {e}")
                quiz_data = self._generate_smart_quiz_from_text(doc.file_name, text)
        else:
            quiz_data = self._generate_smart_quiz_from_text(doc.file_name, text)

        db_quiz = Quiz(
            title=quiz_data.get("title", f"Quiz - {doc.file_name}"),
            difficulty=difficulty
        )
        self.db.add(db_quiz)
        await self.db.flush()

        for q_data in quiz_data.get("questions", []):
            question = Question(
                quiz_id=db_quiz.id,
                question_text=q_data["question_text"],
                options=q_data.get("options", ["A", "B", "C", "D"]),
                correct_option=q_data.get("correct_option", "A"),
                explanation=q_data.get("explanation", "Correct based on course context.")
            )
            self.db.add(question)
            
        await self.db.commit()
        res = await self.db.execute(
            select(Quiz).options(selectinload(Quiz.questions)).filter(Quiz.id == db_quiz.id)
        )
        return res.scalars().first()

    def _generate_smart_quiz_from_text(self, doc_name: str, text: str) -> dict:
        """
        Generates high-quality multiple choice questions with realistic, plausible distractors
        derived directly from document content when AI quota limits are exceeded.
        """
        import random
        
        sentences = [s.strip() for s in text.replace("\n", " ").split(".") if len(s.strip()) > 35]
        if not sentences:
            sentences = [
                "Software Requirements Specification (SRS) establishes a complete agreement between customer and developers.",
                "System design maps domain requirements into scalable software component architecture.",
                "System verification validates that technical requirements meet high reliability and security standards."
            ]

        statement_pool = list(dict.fromkeys(sentences))
        questions = []
        num_questions = min(5, len(statement_pool))

        for i in range(num_questions):
            target = statement_pool[i]
            words = target.split()
            concept_headline = " ".join(words[:6]) if len(words) >= 6 else target[:40]
            
            question_text = f"Which statement best describes '{concept_headline}' based on {doc_name}?"
            correct_answer = target
            
            distractors = []
            for j in range(len(statement_pool)):
                if j != i and len(distractors) < 3:
                    distractors.append(statement_pool[j])

            default_distractors = [
                "It specifies hardware server deployments rather than software functional requirements.",
                "It restricts system execution to single-threaded offline operations without validation.",
                "It is a non-binding operational guideline intended only for post-release patch notes."
            ]

            while len(distractors) < 3:
                d = default_distractors[len(distractors) % len(default_distractors)]
                if d not in distractors and d != correct_answer:
                    distractors.append(d)

            options = [correct_answer] + distractors[:3]
            random.shuffle(options)
            
            keys = ["A", "B", "C", "D"]
            correct_key = keys[options.index(correct_answer)]

            questions.append({
                "question_text": question_text,
                "options": options,
                "correct_option": correct_key,
                "explanation": f"Supported directly by document context: '{correct_answer}'"
            })

        return {
            "title": f"Quiz - {doc_name}",
            "questions": questions
        }

    async def analyze_weak_topics(self, user_id: uuid.UUID) -> dict:
        """
        Analyzes a student's past quiz outcomes and points out weak topics.
        """
        # Fetch latest quiz results
        query = (
            select(QuizResult)
            .filter(QuizResult.user_id == user_id)
            .order_by(QuizResult.completed_at.desc())
            .limit(10)
        )
        result = await self.db.execute(query)
        results = result.scalars().all()

        if not results:
            return {"status": "insufficient_data", "message": "Complete at least 1 quiz to calculate weak topics."}

        # Analyze performance
        scores = [r.score / r.total_questions for r in results]
        average_score = sum(scores) / len(scores) * 100

        # Construct dynamic analysis prompt
        quiz_summary = []
        for r in results:
            quiz_summary.append(f"Quiz: {r.quiz.title}, Score: {r.score}/{r.total_questions}")

        prompt = (
            f"A student has completed several quizzes. Analyze their scores and suggest weak topics and revision plans.\n"
            f"Performance history:\n"
            f"{chr(10).join(quiz_summary)}\n\n"
            f"Respond ONLY with a JSON object containing:\n"
            f'{{"average_score": {average_score}, "weak_topics": ["topic_a"], "strengths": ["topic_b"], "study_action_plan": ["Action 1"]}}'
        )

        try:
            model = genai.GenerativeModel(settings.GEMINI_MODEL)
            response = model.generate_content(prompt)
            raw_text = response.text.replace("```json", "").replace("```", "").strip()
            return json.loads(raw_text)
        except Exception as e:
            return {
                "average_score": average_score,
                "weak_topics": ["General concepts reviewed in quizzes"],
                "strengths": ["Basic modules"],
                "study_action_plan": ["Review chapters where you missed questions", "Re-attempt quizzes to improve your score"]
            }

    async def extract_syllabus_topics(self, file_path: str, file_type: str) -> dict:
        """
        Parses an uploaded syllabus file (PDF, DOCX, TXT) and extracts exact
        course units, syllabus outline topics, weak areas, and day-wise learning progression.
        """
        raw_text = ""
        pages_text = []

        try:
            if "pdf" in file_type.lower():
                reader = PdfReader(file_path)
                for p in reader.pages[:20]:
                    t = p.extract_text() or ""
                    clean = t.encode("ascii", "ignore").decode("ascii")
                    pages_text.append(clean)
                    raw_text += clean + "\n"
            else:
                raw_text = self.extract_text_from_file(file_path, file_type)
        except Exception:
            try:
                with open(file_path, "r", encoding="latin-1", errors="ignore") as f:
                    raw_text = f.read(8000)
            except Exception:
                raw_text = ""

        # 1. Detect Course Title from initial lines
        course_title = "Course Curriculum"
        first_lines = [l.strip() for l in raw_text.split("\n") if len(l.strip()) > 2]
        for l in first_lines[:12]:
            clean_l = re.sub(r'^[0-9\.\-\:\#]+', '', l).strip()
            if any(k in clean_l.lower() for k in [
                "engineering", "science", "management", "development", "programming",
                "architecture", "technology", "system", "database", "network",
                "mathematics", "physics", "python", "java", "software", "algorithms", "ai"
            ]) and len(clean_l) < 55:
                course_title = clean_l
                break

        # 2. Extract Outline / Syllabus Topics directly from PDF pages
        outline_items = []
        if pages_text:
            for page in pages_text[:8]:
                p_lines = [l.strip() for l in page.split("\n") if len(l.strip()) > 2]
                for i, line in enumerate(p_lines):
                    norm = re.sub(r"\s+", "", line).lower()
                    if any(k in norm for k in ["outline", "syllabus", "contents", "index", "topics", "unitoutline"]):
                        for sub_line in p_lines[i+1:]:
                            clean_item = re.sub(r"^[0-9\.\-\•\*\(\)]+", "", sub_line).strip()
                            clean_item = re.sub(r"[^\x20-\x7E]", "", clean_item).strip()
                            if (clean_item and len(clean_item) > 3 and 
                                not any(skip in clean_item.lower() for skip in ["page", "unit outline", "subject code", "university", "faculty", "credits", "lecture"])):
                                outline_items.append(clean_item)
                        break
                if outline_items:
                    break

        # Fallback to heading lines (Unit 1, Chapter 1, Section 1)
        if not outline_items:
            for l in first_lines[:60]:
                lower = l.lower()
                if any(k in lower for k in ["unit", "chapter", "module", "section", "part", "week"]):
                    clean_item = l.split(":")[-1].split("-")[-1].strip()
                    clean_item = re.sub(r"^[0-9\.\-\•\*\(\)]+", "", clean_item).strip()
                    clean_item = re.sub(r"[^\x20-\x7E]", "", clean_item).strip()
                    if clean_item and len(clean_item) > 3 and clean_item not in outline_items:
                        outline_items.append(clean_item)
                        if len(outline_items) >= 10:
                            break

        # 3. If outline items found, structure them cleanly
        extracted_topics = []
        if outline_items:
            for idx, item in enumerate(outline_items):
                clean_name = f"{course_title} - {item}" if len(outline_items) > 1 and course_title not in item else item
                extracted_topics.append({
                    "name": clean_name[:60],
                    "marks": 50,
                    "weak_topics": [f"{item} Problem Solving", f"{item} Practice Sets"],
                    "strong_topics": [f"{item} Foundations", "Core Definitions"],
                    "priority": 8 if idx < 3 else 7,
                    "exam_date": None
                })

        if extracted_topics and len(extracted_topics) >= 2:
            return {
                "classification": "Syllabus / Course Outline",
                "course_metadata": {
                    "course_name": course_title,
                    "total_units": len(extracted_topics),
                    "recommended_hours_per_week": 6
                },
                "topics": extracted_topics
            }

        # 4. Try Gemini AI structured enhancement if available
        if settings.GEMINI_API_KEY and settings.GEMINI_API_KEY != "your_gemini_api_key_here":
            try:
                prompt = (
                    f"You are an expert academic syllabus analyzer. Analyze this syllabus/lecture document:\n\n"
                    f"{raw_text[:7000]}\n\n"
                    f"Extract the main course name and all individual units/topics. "
                    f"Respond ONLY with valid JSON matching:\n"
                    f"{{\n"
                    f'  "classification": "Syllabus / Course Outline",\n'
                    f'  "course_metadata": {{ "course_name": "{course_title}", "total_units": 4 }},\n'
                    f'  "topics": [\n'
                    f'    {{\n'
                    f'      "name": "Subject / Topic Name",\n'
                    f'      "marks": 50,\n'
                    f'      "weak_topics": ["Challenging Concept 1", "Challenging Concept 2"],\n'
                    f'      "strong_topics": ["Foundational Theory", "Definitions"],\n'
                    f'      "priority": 7,\n'
                    f'      "exam_date": null\n'
                    f'    }}\n'
                    f'  ]\n'
                    f"}}"
                )
                model = genai.GenerativeModel(settings.GEMINI_MODEL)
                response = model.generate_content(prompt)
                clean_json = response.text.replace("```json", "").replace("```", "").strip()
                data = json.loads(clean_json)
                if "topics" in data and len(data["topics"]) > 0:
                    return data
            except Exception:
                pass

        if not extracted_topics:
            doc_base = os.path.basename(file_path).rsplit(".", 1)[0].replace("syllabus_", "").replace("_", " ")
            extracted_topics = [
                {
                    "name": course_title or doc_base or "Core Curriculum Subject",
                    "marks": 50,
                    "weak_topics": ["Complex Algorithms", "Practical Problem Sets"],
                    "strong_topics": ["Fundamental Principles", "Overview & Syntax"],
                    "priority": 7,
                    "exam_date": None
                }
            ]

        return {
            "classification": "Syllabus / Course Outline",
            "course_metadata": {
                "course_name": course_title,
                "total_units": len(extracted_topics),
                "recommended_hours_per_week": 6
            },
            "topics": extracted_topics
        }

    async def generate_notes_from_topic(self, subject: str, topic: str) -> dict:
        """Generates executive summary, detailed breakdown, and exam cram notes for a topic."""
        title = f"{subject} — {topic}"
        short_summary = f"Executive summary covering core principles, architecture, and applications of {topic} in {subject}."
        detailed_summary = (
            f"### 1. Conceptual Foundations\n"
            f"- **Overview**: {topic} forms a foundational pillar in {subject}.\n"
            f"- **Core Terminology**: Key definitions, mechanisms, and architectural components.\n\n"
            f"### 2. Deep Dive & Problem Solving\n"
            f"- **Key Algorithms/Techniques**: Standard methods, analysis, and edge case handling for {topic}.\n"
            f"- **Practical Applications**: Real-world system implementation patterns.\n\n"
            f"### 3. Exam Strategies\n"
            f"- Master derivation steps, formulas, and time/space trade-offs."
        )
        exam_notes = (
            f"⚡ **HIGH-YIELD EXAM CHEATSHEET — {topic}**\n\n"
            f"• **Definition**: Concise textbook definition of {topic}.\n"
            f"• **Key Formulas/Rules**: Essential equations and computational rules.\n"
            f"• **Common Pitfalls**: Frequent exam traps and boundary condition errors.\n"
            f"• **Quick Revision**: 3-minute rapid memory recall bullets."
        )

        if settings.GEMINI_API_KEY and settings.GEMINI_API_KEY != "your_gemini_api_key_here":
            try:
                prompt = (
                    f"Generate high-yield study notes for the subject '{subject}' and topic '{topic}'.\n"
                    f"Respond ONLY with valid JSON matching:\n"
                    f'{{"short_summary": "...", "detailed_summary": "...", "exam_notes": "..."}}'
                )
                model = genai.GenerativeModel(settings.GEMINI_MODEL)
                res = await asyncio.wait_for(
                    asyncio.to_thread(model.generate_content, prompt),
                    timeout=3.0
                )
                clean_json = res.text.replace("```json", "").replace("```", "").strip()
                data = json.loads(clean_json)
                return {
                    "title": title,
                    "short_summary": data.get("short_summary", short_summary),
                    "detailed_summary": data.get("detailed_summary", detailed_summary),
                    "exam_notes": data.get("exam_notes", exam_notes)
                }
            except Exception:
                pass

        return {
            "title": title,
            "short_summary": short_summary,
            "detailed_summary": detailed_summary,
            "exam_notes": exam_notes
        }

    async def generate_flashcards_from_topic(self, user_id: uuid.UUID, subject: str, topic: str) -> List[dict]:
        """Generates and saves flashcards for a specific subject and topic."""
        cards_data = [
            {
                "front": f"What is the primary definition and role of {topic} in {subject}?",
                "back": f"{topic} is a critical component in {subject} that governs core data flow, state management, and algorithmic execution.",
                "hint": "Think about foundational principles."
            },
            {
                "front": f"What are the major advantages or use cases of {topic}?",
                "back": f"Enables optimized performance, predictable complexity, modularity, and robust error resilience in {subject}.",
                "hint": "Focus on engineering benefits."
            },
            {
                "front": f"What is a common pitfall or challenging problem associated with {topic}?",
                "back": f"Boundary conditions, concurrency race conditions, or unoptimized time/space complexity.",
                "hint": "Consider edge cases."
            },
            {
                "front": f"How do you evaluate or benchmark the performance of {topic}?",
                "back": f"Through complexity analysis (Big-O notation), latency benchmarks, and test coverage metrics.",
                "hint": "Think about computational bounds."
            }
        ]

        if settings.GEMINI_API_KEY and settings.GEMINI_API_KEY != "your_gemini_api_key_here":
            try:
                prompt = (
                    f"Generate 4 high-yield flashcards for '{subject} - {topic}'.\n"
                    f"Respond ONLY with valid JSON array:\n"
                    f'[{{"front": "...", "back": "...", "hint": "..."}}]'
                )
                model = genai.GenerativeModel(settings.GEMINI_MODEL)
                res = await asyncio.wait_for(
                    asyncio.to_thread(model.generate_content, prompt),
                    timeout=3.0
                )
                clean_json = res.text.replace("```json", "").replace("```", "").strip()
                parsed = json.loads(clean_json)
                if isinstance(parsed, list) and len(parsed) > 0:
                    cards_data = parsed
            except Exception:
                pass

        saved_cards = []
        for c in cards_data:
            fc = Flashcard(
                user_id=user_id,
                front=c["front"],
                back=c["back"],
                hint=c.get("hint"),
                topic=topic,
                concept=subject,
                source="AI_PLANNER",
                difficulty="MEDIUM"
            )
            self.db.add(fc)
            saved_cards.append({
                "id": str(fc.id),
                "front": fc.front,
                "back": fc.back,
                "hint": fc.hint,
                "topic": fc.topic,
                "concept": fc.concept
            })

        await self.db.commit()
        return saved_cards

    async def generate_quiz_from_topic(self, user_id: uuid.UUID, subject: str, topic: str, difficulty: str = "MEDIUM") -> dict:
        """Generates an interactive 5-question multiple choice quiz for a topic."""
        quiz_title = f"{subject} — {topic} Mastery Quiz"
        
        default_questions = [
            {
                "question_text": f"Which of the following best describes the core mechanism of {topic} in {subject}?",
                "options": [
                    f"It provides structured execution flow and state representation for {topic}",
                    "It bypasses all algorithmic invariants unconditionally",
                    "It acts solely as an unmanaged external cache",
                    "It has no direct relationship with system operations"
                ],
                "correct_option": "A",
                "explanation": f"In {subject}, {topic} provides fundamental state representation and invariant guarantees."
            },
            {
                "question_text": f"When implementing {topic}, which consideration is most critical for optimal performance?",
                "options": [
                    "Minimizing computational time complexity and memory overhead",
                    "Ignoring edge cases and boundary limits",
                    "Hardcoding static parameters",
                    "Avoiding modular abstractions"
                ],
                "correct_option": "A",
                "explanation": "Optimal implementations minimize complexity overhead and maintain bounds safety."
            },
            {
                "question_text": f"What is a standard problem-solving approach applied to {topic}?",
                "options": [
                    "Decomposing the problem into sub-problems with systematic evaluation",
                    "Random guess without verification",
                    "Omitting error handling routines",
                    "Disabling runtime checks"
                ],
                "correct_option": "A",
                "explanation": "Systematic problem decomposition is the cornerstone method for mastering this concept."
            },
            {
                "question_text": f"In exam evaluations, questions regarding {topic} most frequently test:",
                "options": [
                    "Conceptual clarity, mathematical/logical formulation, and edge-case behavior",
                    "Hardware pinout configurations only",
                    "Textbook publisher copyright dates",
                    "Deprecation logs from legacy systems"
                ],
                "correct_option": "A",
                "explanation": "Examinations focus on conceptual understanding, formula application, and edge cases."
            }
        ]

        if settings.GEMINI_API_KEY and settings.GEMINI_API_KEY != "your_gemini_api_key_here":
            try:
                prompt = (
                    f"Generate 4 multiple-choice quiz questions for student examination on '{subject}: {topic}'.\n"
                    f"Respond ONLY with valid JSON array matching:\n"
                    f'[{{"question_text": "...", "options": ["Option A", "Option B", "Option C", "Option D"], "correct_option": "A", "explanation": "..."}}]'
                )
                model = genai.GenerativeModel(settings.GEMINI_MODEL)
                res = await asyncio.wait_for(
                    asyncio.to_thread(model.generate_content, prompt),
                    timeout=3.0
                )
                clean_json = res.text.replace("```json", "").replace("```", "").strip()
                parsed = json.loads(clean_json)
                if isinstance(parsed, list) and len(parsed) > 0:
                    default_questions = parsed
            except Exception:
                pass

        quiz = Quiz(
            user_id=user_id,
            title=quiz_title,
            difficulty=difficulty
        )
        self.db.add(quiz)
        await self.db.flush()

        questions_out = []
        for q in default_questions:
            question_obj = Question(
                quiz_id=quiz.id,
                question_text=q["question_text"],
                options=q["options"],
                correct_option=q["correct_option"],
                explanation=q.get("explanation", "")
            )
            self.db.add(question_obj)
            questions_out.append({
                "id": str(question_obj.id),
                "question_text": question_obj.question_text,
                "options": question_obj.options,
                "correct_option": question_obj.correct_option,
                "explanation": question_obj.explanation
            })

        await self.db.commit()
        await self.db.refresh(quiz)

        return {
            "id": str(quiz.id),
            "title": quiz.title,
            "difficulty": quiz.difficulty,
            "questions": questions_out
        }

    async def generate_topic_breakdown(self, subject: str, topic: str, duration_minutes: int = 90) -> dict:
        """Generates dynamic AI breakdown of subtopics, formulas, exam traps, and practice targets."""
        is_rev = "(revision)" in str(topic).lower()
        clean_topic = str(topic).replace("(Revision)", "").replace("(revision)", "").strip()
        if not clean_topic or clean_topic.lower() in ["none", "null", "undefined", ""]:
            clean_topic = f"{subject} Core Concepts & Foundations"
        
        fallback_breakdown = {
            "subject": subject,
            "topic": clean_topic,
            "is_revision": is_rev,
            "subtopics": [
                f"Core Theoretical Principles & Foundations of {clean_topic}",
                f"Key Architectural Mechanisms & Working Procedures in {subject}",
                f"Standard Problem Solving Patterns & Edge-Case Handling",
                f"Comparative Complexity & Performance Trade-offs"
            ],
            "key_formulas_and_definitions": [
                f"Fundamental Formulation: Invariant mathematical/logical rules of {clean_topic}",
                f"Operational Bounds: Best, average, and worst-case resource constraints in {subject}"
            ],
            "exam_pitfalls": f"Watch out for off-by-one errors, boundary condition violations, and unhandled edge cases in {clean_topic}.",
            "practice_targets": [
                f"Work through standard derivations and textbook proofs for {clean_topic}",
                f"Solve 3 practice exercises from previous exam papers",
                f"Complete self-assessment quiz on {clean_topic}"
            ]
        }

        if settings.GEMINI_API_KEY and settings.GEMINI_API_KEY != "your_gemini_api_key_here":
            try:
                prompt = (
                    f"You are a master academic professor. Generate a detailed, highly specific study breakdown for a student studying:\n"
                    f"Subject: {subject}\n"
                    f"Topic: {clean_topic}\n"
                    f"Planned Duration: {duration_minutes} minutes\n"
                    f"Is Revision Session: {is_rev}\n\n"
                    f"Respond ONLY with a valid JSON object matching:\n"
                    f"{{\n"
                    f'  "subtopics": ["Specific Subtopic 1", "Specific Subtopic 2", "Specific Subtopic 3", "Specific Subtopic 4"],\n'
                    f'  "key_formulas_and_definitions": ["Core Formula/Definition 1", "Core Formula/Definition 2"],\n'
                    f'  "exam_pitfalls": "Specific high-risk exam trap or boundary condition mistake to avoid.",\n'
                    f'  "practice_targets": ["Specific practice task 1", "Specific practice task 2", "Specific practice task 3"]\n'
                    f"}}"
                )
                model = genai.GenerativeModel(settings.GEMINI_MODEL)
                res = await asyncio.wait_for(
                    asyncio.to_thread(model.generate_content, prompt),
                    timeout=3.5
                )
                clean_json = res.text.replace("```json", "").replace("```", "").strip()
                data = json.loads(clean_json)
                if "subtopics" in data and len(data["subtopics"]) > 0:
                    return {
                        "subject": subject,
                        "topic": clean_topic,
                        "is_revision": is_rev,
                        "subtopics": data.get("subtopics", fallback_breakdown["subtopics"]),
                        "key_formulas_and_definitions": data.get("key_formulas_and_definitions", fallback_breakdown["key_formulas_and_definitions"]),
                        "exam_pitfalls": data.get("exam_pitfalls", fallback_breakdown["exam_pitfalls"]),
                        "practice_targets": data.get("practice_targets", fallback_breakdown["practice_targets"])
                    }
            except Exception:
                pass

        return fallback_breakdown
