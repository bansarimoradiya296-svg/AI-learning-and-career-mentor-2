import asyncio
import os
import sys
sys.path.insert(0, os.path.abspath("."))
from app.services.ai_companion import AICompanionService

async def test_syllabus():
    service = AICompanionService(None)
    dummy_syllabus = """
    Course: Computer Science Engineering - 3rd Semester
    Syllabus & Curriculum Overview:
    
    Unit 1: Data Structures and Algorithms
    - Topics: Arrays, Stacks, Queues, Linked Lists
    - Advanced: Dynamic Programming, Graph Traversals, Shortest Paths
    
    Unit 2: Database Management Systems
    - Topics: Relational Model, SQL queries, ER Modeling
    - Challenging: Normalization, BCNF, ACID Transactions
    
    Unit 3: Operating Systems
    - Topics: Processes, Threads, CPU Scheduling
    - Complex: Virtual Memory, Page Faults, Semaphores, Deadlocks
    """
    
    test_path = "scratch/sample_syllabus.txt"
    os.makedirs("scratch", exist_ok=True)
    with open(test_path, "w", encoding="utf-8") as f:
        f.write(dummy_syllabus)
        
    result = await service.extract_syllabus_topics(test_path, ".txt")
    print("Syllabus Extraction Result:")
    print(f"Course Metadata: {result.get('course_metadata')}")
    print(f"Extracted {len(result.get('topics', []))} topics:")
    for t in result.get("topics", []):
        print(f"  - Subject: {t.get('name')}")
        print(f"    Weak Topics: {t.get('weak_topics')}")
        print(f"    Priority: {t.get('priority')}")

if __name__ == "__main__":
    asyncio.run(test_syllabus())
