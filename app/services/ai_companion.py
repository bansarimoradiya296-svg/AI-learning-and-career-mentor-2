import io
import json
import uuid
from datetime import datetime, timedelta
from typing import Dict, List, Optional

from pypdf import PdfReader
import docx
from pptx import Presentation
import google.generativeai as genai
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import BadRequestError
from app.models.study import Document, Flashcard, Quiz, Question, QuizResult
from app.services.rag_engine import rag_engine

# Initialize Gemini
genai.configure(api_key=settings.GEMINI_API_KEY)


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

    async def ingest_document(self, document: Document) -> None:
        """
        Parses document, chunks it, generates embeddings, and saves it into ChromaDB.
        """
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
                
        except Exception as e:
            print(f"Error ingesting document {document.id}: {e}")
            document.embedding_status = "FAILED"
            
        self.db.add(document)
        await self.db.flush()

    async def ask_document_rag(self, user_id: uuid.UUID, query: str) -> str:
        """
        Retrieves context chunks from ChromaDB and answers user questions using Gemini.
        """
        collection_name = f"user_docs_{user_id}"
        relevant_chunks = await rag_engine.query_documents(collection_name, query, n_results=4)
        
        context = ""
        for chunk in relevant_chunks:
            context += f"--- Source: {chunk['metadata'].get('file_name', 'Document')} ---\n{chunk['document']}\n\n"

        if not context:
            context = "No relevant context found in uploaded documents."

        prompt = (
            f"You are an expert AI Learning Mentor.\n"
            f"Answer the student's question based strictly on the provided context. "
            f"If the context doesn't contain the answer, use your general knowledge but clearly state that it is not in the documents.\n\n"
            f"--- Context ---\n{context}\n"
            f"--- Question ---\n{query}\n\n"
            f"Provide a clear, detailed, and structured response using Markdown."
        )

        try:
            model = genai.GenerativeModel("gemini-1.5-flash")
            response = model.generate_content(prompt)
            return response.text
        except Exception as e:
            return f"Error querying AI Companion: {str(e)}"

    async def generate_mindmap(self, topic: str, user_id: uuid.UUID) -> dict:
        """
        Generates a hierarchical concept mindmap in JSON format.
        """
        prompt = (
            f"Generate a concept mindmap for the topic: '{topic}'.\n"
            f"Respond ONLY with a valid JSON object matching this structure:\n"
            f'{{"topic": "{topic}", "subtopics": [{{"title": "Subtopic 1", "concepts": ["Concept 1.1", "Concept 1.2"]}}]}}\n'
            f"Do not include any Markdown wrap like ```json. Return raw JSON text only."
        )

        try:
            model = genai.GenerativeModel("gemini-1.5-flash")
            response = model.generate_content(prompt)
            raw_text = response.text.replace("```json", "").replace("```", "").strip()
            return json.loads(raw_text)
        except Exception as e:
            # Fallback mock mindmap on error
            return {
                "topic": topic,
                "subtopics": [
                    {"title": "Core Foundations", "concepts": ["Introduction", "Basic Syntax", "Environment Setup"]},
                    {"title": "Advanced Topics", "concepts": ["Architecture Design", "Optimization", "Security"]}
                ],
                "error": f"LLM error: {str(e)}"
            }

    async def generate_flashcards(self, document_id: uuid.UUID, user_id: uuid.UUID) -> List[Flashcard]:
        """
        Extracts content from document and generates 5 flashcards for spaced repetition.
        """
        result = await self.db.execute(select(Document).filter(Document.id == document_id))
        doc = result.scalars().first()
        if not doc:
            raise BadRequestError("Document not found")

        # Read first 10000 chars for quick flashcard generation
        text = self.extract_text_from_file(doc.file_path, doc.file_type)[:10000]
        
        prompt = (
            f"Based on the following text, generate 5 high-quality flashcards (Question/Front and Answer/Back) for study review.\n"
            f"Return ONLY a JSON array, structured like this:\n"
            f'[{{"front": "Question here", "back": "Answer here"}}]\n'
            f"Do not include any Markdown tags or conversational text. Text:\n{text}"
        )

        cards = []
        try:
            model = genai.GenerativeModel("gemini-1.5-flash")
            response = model.generate_content(prompt)
            raw_text = response.text.replace("```json", "").replace("```", "").strip()
            parsed_cards = json.loads(raw_text)
            
            for item in parsed_cards:
                flashcard = Flashcard(
                    user_id=user_id,
                    document_id=document_id,
                    front=item["front"],
                    back=item["back"],
                    ease_factor=2.5,
                    interval_days=1,
                    next_review_at=datetime.utcnow()
                )
                self.db.add(flashcard)
                cards.append(flashcard)
            
            await self.db.flush()
        except Exception as e:
            print(f"Failed to generate flashcards: {e}")
            
        return cards

    async def generate_quiz(self, document_id: uuid.UUID, difficulty: str = "MEDIUM") -> Optional[Quiz]:
        """
        Generates a multiple choice quiz based on the document.
        """
        result = await self.db.execute(select(Document).filter(Document.id == document_id))
        doc = result.scalars().first()
        if not doc:
            return None

        # Load first 15000 chars of document
        text = self.extract_text_from_file(doc.file_path, doc.file_type)[:15000]

        prompt = (
            f"Based on the text below, generate 5 multiple choice questions for a quiz at a '{difficulty}' difficulty level.\n"
            f"Return ONLY a JSON object containing a list of questions, formatted like this:\n"
            f'{{"title": "Quiz Title", "questions": [{{"question_text": "Question?", "options": ["A", "B", "C", "D"], "correct_option": "A", "explanation": "Why correct"}}]}}\n'
            f"Do not wrap in Markdown blocks. Text:\n{text}"
        )

        try:
            model = genai.GenerativeModel("gemini-1.5-flash")
            response = model.generate_content(prompt)
            raw_text = response.text.replace("```json", "").replace("```", "").strip()
            quiz_data = json.loads(raw_text)
            
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
                    options=q_data["options"],
                    correct_option=q_data["correct_option"],
                    explanation=q_data.get("explanation")
                )
                self.db.add(question)
                
            await self.db.flush()
            return db_quiz
        except Exception as e:
            print(f"Quiz generation error: {e}")
            return None

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
            model = genai.GenerativeModel("gemini-1.5-flash")
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
