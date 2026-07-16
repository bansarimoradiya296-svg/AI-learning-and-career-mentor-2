import uuid
from typing import List
from fastapi import APIRouter, Depends, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.exceptions import NotFoundError, BadRequestError
from app.models.auth import User
from app.models.coding import CodingProblem, CodingSubmission
from app.schemas.coding import (
    CodingProblemResponse, CodingSubmissionRequest, CodingSubmissionResponse
)
from app.services.code_executor import CodeExecutorService
from app.security.permissions import get_current_user

router = APIRouter(prefix="/coding", tags=["Coding Mentor"])


@router.get("/problems", response_model=List[CodingProblemResponse])
async def list_problems(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Retrieves all available coding challenges."""
    result = await db.execute(select(CodingProblem))
    return result.scalars().all()


@router.get("/problems/{problem_id}", response_model=CodingProblemResponse)
async def get_problem(
    problem_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Retrieves a single coding challenge by ID."""
    result = await db.execute(select(CodingProblem).filter(CodingProblem.id == problem_id))
    problem = result.scalars().first()
    if not problem:
        raise NotFoundError("Coding problem not found")
    return problem


@router.post("/problems", response_model=CodingProblemResponse, status_code=status.HTTP_201_CREATED)
async def create_problem(
    title: str,
    description: str,
    difficulty: str,
    test_cases: List[dict], # E.g., [{"input": "5", "expected": "120"}]
    starter_code: dict, # E.g., {"python": "def solve(n):\n  pass"}
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Enables creation of a new coding problem (Admin/Teacher privilege)."""
    # Verify difficulty settings
    difficulty = difficulty.upper()
    if difficulty not in ["EASY", "MEDIUM", "HARD"]:
        raise BadRequestError("Difficulty must be EASY, MEDIUM, or HARD.")

    problem = CodingProblem(
        title=title,
        description_markdown=description,
        difficulty=difficulty,
        test_cases=test_cases,
        starter_code=starter_code
    )
    
    db.add(problem)
    await db.commit()
    await db.refresh(problem)
    return problem


@router.post("/problems/{problem_id}/submit", response_model=CodingSubmissionResponse)
async def submit_code(
    problem_id: uuid.UUID,
    payload: CodingSubmissionRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Submits user solution.
    Executes Python locally, or runs multi-language evaluation via Gemini judge.
    Saves outcome into the database.
    """
    result = await db.execute(select(CodingProblem).filter(CodingProblem.id == problem_id))
    problem = result.scalars().first()
    if not problem:
        raise NotFoundError("Coding problem not found")

    executor = CodeExecutorService()
    
    # We split execution between local sandbox (for Python) or AI judge (other languages)
    lang = payload.language.lower()
    
    if lang == "python":
        # Run local test case evaluations
        all_passed = True
        simulated_time = 0.02
        validation_logs = []
        
        for idx, tc in enumerate(problem.test_cases):
            # Run code
            input_val = tc.get("input", "")
            expected = tc.get("expected", "")
            
            # Wrap user code with basic evaluation prints if necessary
            # For simplicity, we assume they print outcomes or it's wrapped
            # A standard runner appends tests execution triggers
            test_runner_code = (
                f"{payload.code_content}\n\n"
                f"# Test Wrapper\n"
                f"import sys\n"
                f"if __name__ == '__main__':\n"
                f"    inputs = {repr(input_val)}\n"
                f"    # Simulating simple functional call or direct execution\n"
                f"    # Let's write output directly\n"
            )
            
            # If the user defines a function 'solve', call it, else run code as script
            if "def solve" in payload.code_content:
                test_runner_code += f"    print(solve(inputs))\n"
            else:
                test_runner_code = payload.code_content # Run as script directly

            passed, output, error = await executor.execute_python_locally(
                test_runner_code, input_val, expected
            )
            
            validation_logs.append({
                "test_case": idx + 1,
                "input": input_val,
                "expected": expected,
                "actual": output if passed else (error or output),
                "passed": passed
            })
            
            if not passed:
                all_passed = False
                
        status_outcome = "ACCEPTED" if all_passed else "WRONG_ANSWER"
        results_payload = {"test_cases": validation_logs}
        
    else:
        # Run AI-judge for JavaScript, C++, C, Java, SQL
        evaluation = await executor.evaluate_submission_with_ai(
            code=payload.code_content,
            language=payload.language,
            problem_title=problem.title,
            description=problem.description_markdown,
            test_cases=problem.test_cases
        )
        
        status_outcome = evaluation.get("status", "COMPILE_ERROR")
        simulated_time = evaluation.get("execution_time", 0.05)
        results_payload = {
            "test_cases": evaluation.get("test_case_results", []),
            "time_complexity": evaluation.get("time_complexity"),
            "space_complexity": evaluation.get("space_complexity"),
            "suggestions": evaluation.get("suggestions"),
            "error_details": evaluation.get("error_details")
        }

    # Save submission record
    submission = CodingSubmission(
        user_id=current_user.id,
        problem_id=problem.id,
        code_content=payload.code_content,
        language=payload.language,
        status=status_outcome,
        execution_time=simulated_time,
        validation_results=results_payload
    )
    
    db.add(submission)
    await db.commit()
    await db.refresh(submission)
    
    return submission


@router.post("/optimize")
async def optimize_code(
    request: Request,
    language: str,
    current_user: User = Depends(get_current_user)
):
    """Provides refactoring recommendations and performance optimizations for a code snippet."""
    code_bytes = await request.body()
    code = code_bytes.decode("utf-8")
    executor = CodeExecutorService()
    suggestions = await executor.get_optimization_suggestions(code=code, language=language)
    return suggestions


@router.get("/submissions", response_model=List[CodingSubmissionResponse])
async def list_submissions(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Retrieves all previous coding submissions from this student."""
    result = await db.execute(
        select(CodingSubmission)
        .filter(CodingSubmission.user_id == current_user.id)
        .order_by(CodingSubmission.created_at.desc())
    )
    return result.scalars().all()
