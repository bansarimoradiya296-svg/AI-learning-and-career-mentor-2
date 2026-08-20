import os
import sys
from sqlalchemy import create_engine, select, MetaData, Table, text

# Ensure current directory is in sys.path
root_dir = os.path.abspath(os.path.dirname(__file__))
if root_dir not in sys.path:
    sys.path.insert(0, root_dir)

# Import Base and models to register them in metadata
from app.core.database import Base
from app.models.auth import Role, Permission, User, UserSession, LoginHistory, AuditLog
from app.models.study import Document, Flashcard, Course, Topic, Chapter, Quiz, Question, QuizResult
from app.models.coding import CodingProblem, CodingSubmission
from app.models.career import CareerGoal, Roadmap, RecommendedProject, Certification
from app.models.interview import InterviewSession, InterviewMessage, InterviewReport
from app.models.billing import Subscription, Payment, Badge, UserAchievement

# Configuration
SQLITE_URL = "sqlite:///./ai_mentor.db"
POSTGRES_URL = "postgresql://postgres:postgres@localhost:5432/ai_mentor"

def migrate():
    print("Starting database migration from SQLite to PostgreSQL...")
    
    # 1. Connect to both databases
    sqlite_engine = create_engine(SQLITE_URL)
    postgres_engine = create_engine(POSTGRES_URL)
    
    # 2. Ensure all tables are created in PostgreSQL
    print("Creating tables in PostgreSQL if they don't exist...")
    Base.metadata.create_all(postgres_engine)
    
    # Get sorted tables based on foreign key dependencies
    sorted_tables = Base.metadata.sorted_tables
    
    with sqlite_engine.connect() as sqlite_conn:
        with postgres_engine.begin() as postgres_conn:
            # We need to copy data table-by-table
            for table in sorted_tables:
                table_name = table.name
                print(f"Migrating table: {table_name}...")
                
                # Read all rows from SQLite
                rows = sqlite_conn.execute(select(table)).fetchall()
                if not rows:
                    print(f"  No data found in {table_name}. Skipping.")
                    continue
                
                # Insert into PostgreSQL
                print(f"  Copying {len(rows)} rows...")
                for row in rows:
                    # Convert row object to dict
                    row_dict = dict(row._mapping)
                    # Insert row
                    postgres_conn.execute(table.insert().values(**row_dict))
                    
                # If postgres uses sequences, we need to update the sequence value for id column
                # so that future auto-increment inserts don't collide.
                if 'id' in table.columns:
                    print(f"  Resetting sequence for {table_name}...")
                    # Get current max ID or default to 1
                    max_id_res = postgres_conn.execute(text(f"SELECT COALESCE(MAX(id), 1) FROM {table_name}")).scalar()
                    postgres_conn.execute(text(f"SELECT setval(pg_get_serial_sequence('{table_name}', 'id'), :max_id, false)"), {"max_id": max_id_res + 1})
                    
    print("Migration completed successfully!")

if __name__ == "__main__":
    migrate()
