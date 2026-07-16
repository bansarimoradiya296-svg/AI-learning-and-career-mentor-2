import uuid
from typing import Dict, List, Optional
import httpx
import google.generativeai as genai
from app.core.config import settings

# Configure Google Gemini
genai.configure(api_key=settings.GEMINI_API_KEY)


class RAGEngine:
    def __init__(self):
        self.chroma_url = f"http://{settings.CHROMADB_HOST}:{settings.CHROMADB_PORT}/api/v1"
        self.client = httpx.AsyncClient(timeout=30.0)
        self.in_memory_db = {}  # Format: {collection_name: {doc_id: {"document": doc, "metadata": meta, "embedding": emb}}}

    def cosine_similarity(self, v1: List[float], v2: List[float]) -> float:
        """Calculates the cosine similarity between two vectors."""
        dot_product = sum(x * y for x, y in zip(v1, v2))
        norm_v1 = sum(x * x for x in v1) ** 0.5
        norm_v2 = sum(x * x for x in v2) ** 0.5
        if norm_v1 == 0 or norm_v2 == 0:
            return 0.0
        return dot_product / (norm_v1 * norm_v2)

    async def get_embedding(self, text: str) -> List[float]:
        """
        Generates text embedding using Google Gemini API.
        """
        try:
            # Check if Gemini key is set, fallback if in development / test mock
            if settings.GEMINI_API_KEY == "mock_key_or_replace_with_real_api_key":
                # Mock embedding (768 dimensions of zeroes)
                return [0.0] * 768

            response = genai.embed_content(
                model="models/text-embedding-004",
                content=text,
                task_type="retrieval_document"
            )
            return response["embedding"]
        except Exception as e:
            print(f"Gemini embedding error: {e}. Falling back to mock vector.")
            return [0.0] * 768

    async def check_chroma_connection(self) -> bool:
        """Verifies ChromaDB server is online with a short timeout."""
        try:
            response = await self.client.get(f"{self.chroma_url}/heartbeat", timeout=1.0)
            return response.status_code == 200
        except Exception:
            return False

    async def get_or_create_collection(self, collection_name: str) -> Optional[str]:
        """
        Retrieves or creates a ChromaDB collection.
        Returns the collection ID string.
        """
        try:
            # Check if exists
            list_res = await self.client.get(f"{self.chroma_url}/collections", timeout=2.0)
            if list_res.status_code == 200:
                collections = list_res.json()
                for col in collections:
                    if col["name"] == collection_name:
                        return col["id"]

            # Create new
            create_res = await self.client.post(
                f"{self.chroma_url}/collections",
                json={"name": collection_name, "metadata": {"hnsw:space": "cosine"}},
                timeout=2.0
            )
            if create_res.status_code in [200, 201]:
                return create_res.json()["id"]
        except Exception as e:
            print(f"ChromaDB connection/creation error: {e}")
        return None

    async def add_documents(
        self, collection_name: str, documents: List[str], metadatas: List[Dict], ids: List[str]
    ) -> bool:
        """
        Generates embeddings and inserts documents into a collection.
        Falls back to in-memory store if ChromaDB is offline.
        """
        is_online = await self.check_chroma_connection()
        if not is_online:
            print(f"ChromaDB offline. Adding documents to in-memory fallback for collection '{collection_name}'...")
            if collection_name not in self.in_memory_db:
                self.in_memory_db[collection_name] = {}
            
            for doc, meta, doc_id in zip(documents, metadatas, ids):
                emb = await self.get_embedding(doc)
                self.in_memory_db[collection_name][doc_id] = {
                    "document": doc,
                    "metadata": meta,
                    "embedding": emb
                }
            return True

        collection_id = await self.get_or_create_collection(collection_name)
        if not collection_id:
            return False

        # Convert documents to embeddings
        embeddings = []
        for doc in documents:
            emb = await self.get_embedding(doc)
            embeddings.append(emb)

        payload = {
            "embeddings": embeddings,
            "metadatas": metadatas,
            "documents": documents,
            "ids": ids
        }

        try:
            res = await self.client.post(
                f"{self.chroma_url}/collections/{collection_id}/add",
                json=payload
            )
            return res.status_code in [200, 201]
        except Exception as e:
            print(f"Failed to add documents to ChromaDB: {e}")
            return False

    async def query_documents(
        self, collection_name: str, query_text: str, n_results: int = 5
    ) -> List[Dict]:
        """
        Queries ChromaDB (or in-memory fallback) for similar text chunks.
        """
        is_online = await self.check_chroma_connection()
        if not is_online:
            print(f"ChromaDB offline. Querying in-memory fallback for collection '{collection_name}'...")
            collection = self.in_memory_db.get(collection_name, {})
            if not collection:
                return []

            query_emb = await self.get_embedding(query_text)
            results = []
            for doc_id, item in collection.items():
                sim = self.cosine_similarity(query_emb, item["embedding"])
                results.append({
                    "document": item["document"],
                    "metadata": item["metadata"],
                    "distance": 1.0 - sim  # cosine distance is 1 - similarity
                })
            
            results.sort(key=lambda x: x["distance"])
            return results[:n_results]

        collection_id = await self.get_or_create_collection(collection_name)
        if not collection_id:
            return []

        query_emb = await self.get_embedding(query_text)
        
        payload = {
            "query_embeddings": [query_emb],
            "n_results": n_results,
            "include": ["documents", "metadatas", "distances"]
        }

        try:
            res = await self.client.post(
                f"{self.chroma_url}/collections/{collection_id}/query",
                json=payload
            )
            if res.status_code == 200:
                data = res.json()
                results = []
                # Restructure results for convenience
                if data.get("documents"):
                    docs = data["documents"][0]
                    metas = data["metadatas"][0]
                    dists = data["distances"][0]
                    for i in range(len(docs)):
                        results.append({
                            "document": docs[i],
                            "metadata": metas[i],
                            "distance": dists[i]
                        })
                return results
        except Exception as e:
            print(f"Failed to query ChromaDB: {e}")
        return []

    async def close(self):
        await self.client.aclose()


rag_engine = RAGEngine()
