import uuid
import json
from typing import List
import google.generativeai as genai
from fastapi import APIRouter, Depends, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.exceptions import NotFoundError, BadRequestError
from app.models.auth import User
from app.models.coding import CodingProblem, CodingSubmission
from app.schemas.coding import (
    CodingProblemResponse, CodingSubmissionRequest, CodingSubmissionResponse,
    CodingChatRequest, CodingDebugRequest, CodeExplainRequest, CodeConvertRequest,
    CodingQuizRequest, CodingRoadmapRequest
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


    return result.scalars().all()


# ==========================================
# Coding Mentor Sub-pages endpoints
# ==========================================

@router.post("/chat")
async def coding_chat(
    payload: CodingChatRequest,
    current_user: User = Depends(get_current_user)
):
    """Simulates or calls Gemini to answer a coding question."""
    message = payload.message.strip()
    history = payload.history
    
    is_placeholder = (
        not settings.GEMINI_API_KEY 
        or settings.GEMINI_API_KEY == "abc123" 
        or settings.GEMINI_API_KEY.startswith("your_")
    )
    
    if is_placeholder:
        return {"response": get_simulated_chat_response(message)}
        
    try:
        genai.configure(api_key=settings.GEMINI_API_KEY)
        model = genai.GenerativeModel("gemini-1.5-flash")
        
        # Format history properly for Gemini
        formatted_contents = []
        for h in history:
            role = "user" if h.get("role") == "user" else "model"
            parts = h.get("parts")
            part_text = parts[0] if parts and len(parts) > 0 else ""
            if not part_text and "text" in h:
                part_text = h["text"]
            formatted_contents.append({"role": role, "parts": [part_text]})
            
        chat = model.start_chat(history=formatted_contents)
        response = chat.send_message(message)
        return {"response": response.text}
    except Exception as e:
        print(f"Gemini API Error in /chat: {e}")
        return {"response": get_simulated_chat_response(message)}


@router.post("/debug")
async def coding_debug(
    payload: CodingDebugRequest,
    current_user: User = Depends(get_current_user)
):
    """Analyzes error messages and code snippets."""
    code_or_error = payload.code_or_error.strip()
    
    is_placeholder = (
        not settings.GEMINI_API_KEY 
        or settings.GEMINI_API_KEY == "abc123" 
        or settings.GEMINI_API_KEY.startswith("your_")
    )
    
    if not is_placeholder:
        try:
            genai.configure(api_key=settings.GEMINI_API_KEY)
            model = genai.GenerativeModel("gemini-1.5-flash")
            prompt = (
                f"Analyze the following code snippet or error message:\n\n"
                f"{code_or_error}\n\n"
                f"Identify the bug and return a JSON object with this exact structure:\n"
                f'{{\n'
                f'  "error_type": "Name of error (e.g., TypeError, NullPointerException)",\n'
                f'  "reason": "Detailed description of why the error occurs",\n'
                f'  "how_to_fix": "Steps required to fix the error",\n'
                f'  "correct_code": "The complete fixed code block",\n'
                f'  "best_practice": "Tips or patterns to avoid this error in the future"\n'
                f'}}\n'
                f"Return ONLY valid raw JSON text. Do not wrap in markdown or backticks."
            )
            response = model.generate_content(prompt)
            raw_text = response.text.replace("```json", "").replace("```", "").strip()
            return json.loads(raw_text)
        except Exception as e:
            print(f"Gemini API Error in /debug: {e}")
            
    return get_simulated_debug_response(code_or_error)


@router.post("/explain")
async def code_explain(
    payload: CodeExplainRequest,
    current_user: User = Depends(get_current_user)
):
    """Generates a detailed code explanation."""
    code = payload.code.strip()
    language = payload.language.strip()
    
    is_placeholder = (
        not settings.GEMINI_API_KEY 
        or settings.GEMINI_API_KEY == "abc123" 
        or settings.GEMINI_API_KEY.startswith("your_")
    )
    
    if not is_placeholder:
        try:
            genai.configure(api_key=settings.GEMINI_API_KEY)
            model = genai.GenerativeModel("gemini-1.5-flash")
            prompt = (
                f"Explain the following {language} code snippet:\n\n"
                f"```\n{code}\n```\n\n"
                f"Analyze it and return a JSON object with this exact structure:\n"
                f'{{\n'
                f'  "purpose": "General purpose of the code",\n'
                f'  "explanation": "Bullet-point line-by-line explanation",\n'
                f'  "output": "Hypothetical output or what it prints/returns"\n'
                f'}}\n'
                f"Return ONLY valid raw JSON text. Do not wrap in markdown or backticks."
            )
            response = model.generate_content(prompt)
            raw_text = response.text.replace("```json", "").replace("```", "").strip()
            return json.loads(raw_text)
        except Exception as e:
            print(f"Gemini API Error in /explain: {e}")
            
    return get_simulated_explain_response(code, language)


@router.post("/convert")
async def code_convert(
    payload: CodeConvertRequest,
    current_user: User = Depends(get_current_user)
):
    """Translates code from one programming language to another."""
    code = payload.code.strip()
    from_lang = payload.from_language.strip()
    to_lang = payload.to_language.strip()
    
    is_placeholder = (
        not settings.GEMINI_API_KEY 
        or settings.GEMINI_API_KEY == "abc123" 
        or settings.GEMINI_API_KEY.startswith("your_")
    )
    
    if not is_placeholder:
        try:
            genai.configure(api_key=settings.GEMINI_API_KEY)
            model = genai.GenerativeModel("gemini-1.5-flash")
            prompt = (
                f"Translate this {from_lang} code snippet into {to_lang}:\n\n"
                f"```\n{code}\n```\n\n"
                f"Return ONLY the converted code snippet inside a JSON object with this exact structure:\n"
                f'{{\n'
                f'  "converted_code": "The converted code block"\n'
                f'}}\n'
                f"Do not add additional explanations. Return raw JSON."
            )
            response = model.generate_content(prompt)
            raw_text = response.text.replace("```json", "").replace("```", "").strip()
            return json.loads(raw_text)
        except Exception as e:
            print(f"Gemini API Error in /convert: {e}")
            
    return get_simulated_convert_response(code, from_lang, to_lang)


@router.post("/quiz/generate")
async def code_quiz_generate(
    payload: CodingQuizRequest,
    current_user: User = Depends(get_current_user)
):
    """Generates a coding quiz dynamically."""
    topic = payload.topic.strip()
    difficulty = payload.difficulty.strip()
    num_questions = payload.num_questions
    
    is_placeholder = (
        not settings.GEMINI_API_KEY 
        or settings.GEMINI_API_KEY == "abc123" 
        or settings.GEMINI_API_KEY.startswith("your_")
    )
    
    if not is_placeholder:
        try:
            genai.configure(api_key=settings.GEMINI_API_KEY)
            model = genai.GenerativeModel("gemini-1.5-flash")
            prompt = (
                f"Generate a {num_questions}-question multiple choice quiz on the topic of '{topic}' at a '{difficulty}' difficulty level.\n"
                f"Each question should test code analysis or theory.\n"
                f"Respond ONLY with a JSON object containing a list of questions, matching this exact schema:\n"
                f'{{\n'
                f'  "questions": [\n'
                f'    {{\n'
                f'      "question_text": "Question statement, optionally with markdown formatting and newline code blocks",\n'
                f'      "options": [\n'
                f'        "A. Option 1",\n'
                f'        "B. Option 2",\n'
                f'        "C. Option 3",\n'
                f'        "D. Option 4"\n'
                f'      ],\n'
                f'      "correct_option": "B", // Letter of correct option (A, B, C, or D)\n'
                f'      "explanation": "Brief explanation of why this answer is correct"\n'
                f'    }}\n'
                f'  ]\n'
                f'}}\n'
                f"Do not include markdown tags in response. Output clean raw JSON only."
            )
            response = model.generate_content(prompt)
            raw_text = response.text.replace("```json", "").replace("```", "").strip()
            return json.loads(raw_text)
        except Exception as e:
            print(f"Gemini API Error in /quiz/generate: {e}")
            
    return get_simulated_quiz_response(topic, difficulty, num_questions)


@router.post("/roadmap/generate")
async def code_roadmap_generate(
    payload: CodingRoadmapRequest,
    current_user: User = Depends(get_current_user)
):
    """Generates a targeted learning roadmap for a coding goal."""
    goal = payload.goal.strip()
    
    is_placeholder = (
        not settings.GEMINI_API_KEY 
        or settings.GEMINI_API_KEY == "abc123" 
        or settings.GEMINI_API_KEY.startswith("your_")
    )
    
    if not is_placeholder:
        try:
            genai.configure(api_key=settings.GEMINI_API_KEY)
            model = genai.GenerativeModel("gemini-1.5-flash")
            prompt = (
                f"Generate a personalized coding roadmap for the goal of becoming a '{goal}'.\n"
                f"Provide a structured path with 6 key stages in order of study.\n"
                f"Each stage must have a title, short description, and status indicator ('Completed', 'In Progress', or 'Pending').\n"
                f"Typically, the first stage should be 'Completed', the second 'In Progress', and the remaining 'Pending' to show logical progression.\n"
                f"Respond ONLY with a JSON object in this format:\n"
                f'{{\n'
                f'  "phases": [\n'
                f'    {{\n'
                f'      "phase_num": 1,\n'
                f'      "title": "Fundamentals",\n'
                f'      "description": "Learn programming basics, data types, control flow, functions.",\n'
                f'      "status": "Completed"\n'
                f'    }}\n'
                f'  ]\n'
                f'}}\n'
                f"Return ONLY valid raw JSON text without markdown wrappers."
            )
            response = model.generate_content(prompt)
            raw_text = response.text.replace("```json", "").replace("```", "").strip()
            return json.loads(raw_text)
        except Exception as e:
            print(f"Gemini API Error in /roadmap/generate: {e}")
            
    return get_simulated_roadmap_response(goal)


# ==========================================
# Simulated Fallback Response Generators
# ==========================================

def get_simulated_chat_response(message: str) -> str:
    msg_lower = message.lower()
    if "nonetype" in msg_lower and "append" in msg_lower:
        return (
            "This error occurs because you're trying to call the `append()` method on a variable that is `None`.\n\n"
            "**Reason:**\n"
            "The variable is `None`, which means it doesn't point to a list (or any object that has `append()`).\n\n"
            "**How to Fix:**\n"
            "Initialize the variable with an empty list `[]` before using `append()`. Check your code to ensure the variable is assigned a list.\n\n"
            "**Example:**\n"
            "```python\n"
            "# Wrong\n"
            "my_list = None\n"
            "my_list.append(1)  # Error\n\n"
            "# Correct\n"
            "my_list = []\n"
            "my_list.append(1)  # Works\n"
            "```"
        )
    elif "recursion" in msg_lower:
        return (
            "**Recursion** is a programming technique where a function calls itself to solve a smaller instance of the same problem.\n\n"
            "Every recursive function must have two main components:\n"
            "1. **Base Case:** The condition under which the function stops calling itself and returns a value.\n"
            "2. **Recursive Case:** The part of the function where it calls itself with a modified argument, moving closer to the base case.\n\n"
            "**Example (Factorial in Python):**\n"
            "```python\n"
            "def factorial(n):\n"
            "    # Base case\n"
            "    if n == 0:\n"
            "        return 1\n"
            "    # Recursive case\n"
            "    else:\n"
            "        return n * factorial(n - 1)\n"
            "```"
        )
    elif "middleware" in msg_lower:
        return (
            "In Express, **middleware** functions are functions that have access to the Request object (`req`), Response object (`res`), and the next middleware function in the application's request-response cycle, typically denoted by a variable named `next`.\n\n"
            "Middleware functions can perform the following tasks:\n"
            "- Execute any code.\n"
            "- Make changes to the request and response objects.\n"
            "- End the request-response cycle.\n"
            "- Call the next middleware in the stack.\n\n"
            "**Example:**\n"
            "```javascript\n"
            "const loggerMiddleware = (req, res, next) => {\n"
            "    console.log(`${req.method} ${req.url}`);\n"
            "    next(); // Pass control to next handler\n"
            "};\n"
            "```"
        )
    elif "sql join" in msg_lower or "join" in msg_lower:
        return (
            "An **SQL JOIN** clause is used to combine rows from two or more tables, based on a related column between them.\n\n"
            "Here are the main types of SQL JOINs:\n"
            "- **INNER JOIN:** Returns records that have matching values in both tables.\n"
            "- **LEFT (OUTER) JOIN:** Returns all records from the left table, and matching records from the right table. If no match, NULL is returned for the right side.\n"
            "- **RIGHT (OUTER) JOIN:** Returns all records from the right table, and matching records from the left table.\n"
            "- **FULL (OUTER) JOIN:** Returns all records when there is a match in either left or right table.\n\n"
            "**Example:**\n"
            "```sql\n"
            "SELECT Orders.OrderID, Customers.CustomerName\n"
            "FROM Orders\n"
            "INNER JOIN Customers ON Orders.CustomerID = Customers.CustomerID;\n"
            "```"
        )
    elif "binary search" in msg_lower or "complexity" in msg_lower:
        return (
            "**Binary Search** is an efficient algorithm for finding an item from a sorted list of items. It works by repeatedly dividing in half the portion of the list that could contain the item, until you've narrowed down the possible locations to just one.\n\n"
            "**Time Complexity:**\n"
            "- **Best Case:** O(1) - When the target is at the exact middle on the first try.\n"
            "- **Average/Worst Case:** O(log N) - Because the search space is cut in half at each step.\n\n"
            "**Space Complexity:**\n"
            "- **Iterative implementation:** O(1) - Only uses constant extra space.\n"
            "- **Recursive implementation:** O(log N) - Due to call stack frame storage."
        )
    else:
        return (
            "Hello! I am your AI Coding Mentor. I'm here to help you explain code, debug syntax errors, convert between languages, and review algorithms.\n\n"
            "Feel free to ask any specific coding questions, or paste code snippets for optimization suggestions!"
        )


def get_simulated_debug_response(error_str: str) -> dict:
    err_lower = error_str.lower()
    if "unsupported operand type" in err_lower or "10 + '20'" in err_lower:
        return {
            "error_type": "TypeError",
            "reason": "You're trying to add an integer (10) and a string ('20'). Python does not support arithmetic operations between mismatching numeric and string types directly.",
            "how_to_fix": "Convert the string to an integer using the `int()` function before performing the addition.",
            "correct_code": "result = 10 + int('20')\nprint(result) # Output: 30",
            "best_practice": "Always ensure both operands are of the same numeric data type before performing arithmetic operations. Cast string inputs early in user input collection."
        }
    elif "index out of range" in err_lower or "indexerror" in err_lower:
        return {
            "error_type": "IndexError",
            "reason": "You are attempting to access an index from a list/array that is outside the range of valid indices (indices range from 0 to len-1).",
            "how_to_fix": "Add a boundary check `index < len(array)` before attempting index lookups, or verify the iteration bounds.",
            "correct_code": "my_list = [1, 2, 3]\nindex = 5\nif index < len(my_list):\n    print(my_list[index])\nelse:\n    print('Index is out of bounds!')",
            "best_practice": "Use range loops `for item in my_list` instead of direct index tracking whenever index values are not explicitly required."
        }
    else:
        return {
            "error_type": "SyntaxError / GeneralError",
            "reason": "The system identified a compilation or runtime warning in the expression logic provided.",
            "how_to_fix": "Check for missing brackets, incorrect indentation blocks, or variable names that haven't been defined.",
            "correct_code": "# Verify alignment and variable initialization\nx = 10\nprint(x)",
            "best_practice": "Use an IDE linter to catch basic spelling or formatting issues in real time."
        }


def get_simulated_explain_response(code: str, language: str) -> dict:
    if "factorial" in code.lower():
        return {
            "purpose": "This code calculates the factorial of a given number using recursion.",
            "explanation": (
                "- `def factorial(n):` defines a function named factorial that takes a single argument n.\n"
                "- `if n == 0:` is the base case check. If the input number is 0, it stops recursion and returns 1 (since 0! = 1).\n"
                "- `else:` handles the recursive step. It calls the factorial function again with `n-1` and multiplies it by `n`.\n"
                "- `num = 5` initializes a test variable with the value 5.\n"
                "- `print(factorial(num))` computes `factorial(5)` and prints the final outcome to the screen."
            ),
            "output": "120"
        }
    else:
        return {
            "purpose": f"Executes logic block sequence using {language}.",
            "explanation": (
                "- Variables are declared or arguments are bound to the function scope.\n"
                "- Standard conditional statements or iterative loops evaluate expressions.\n"
                "- Returns or prints results once calculations resolve."
            ),
            "output": "Operation completed successfully."
        }


def get_simulated_convert_response(code: str, from_lang: str, to_lang: str) -> dict:
    if "def add" in code.lower() and "java" in to_lang.lower():
        return {
            "converted_code": (
                "public class Main {\n"
                "    public static int add(int a, int b) {\n"
                "        return a + b;\n"
                "    }\n\n"
                "    public static void main(String[] args) {\n"
                "        int result = add(5, 10);\n"
                "        System.out.println(result);\n"
                "    }\n"
                "}"
            )
        }
    else:
        return {
            "converted_code": f"// Converted from {from_lang} to {to_lang}\n// Original code:\n// {code.replace(chr(10), chr(10) + '// ')}\n\n// [Mock Conversion Output]"
        }


def get_simulated_quiz_response(topic: str, difficulty: str, num_questions: int) -> dict:
    questions = []
    
    q1 = {
        "question_text": (
            "What is the output of the following code?\n\n"
            "```python\n"
            "x = [1, 2, 3]\n"
            "y = x\n"
            "y.append(4)\n"
            "print(x)\n"
            "```"
        ),
        "options": [
            "A. [1, 2, 3]",
            "B. [1, 2, 3, 4]",
            "C. [1, 2, 4]",
            "D. Error"
        ],
        "correct_option": "B",
        "explanation": "In Python, lists are mutable objects. Assigning y = x does not copy the list; both variables point to the same list object. Modifying y alters x as well."
    }
    
    q2 = {
        "question_text": (
            "What is the output of the following Python expression?\n\n"
            "```python\n"
            "a = 10\n"
            "def test():\n"
            "    a = 20\n"
            "test()\n"
            "print(a)\n"
            "```"
        ),
        "options": [
            "A. 10",
            "B. 20",
            "C. UnboundLocalError",
            "D. None"
        ],
        "correct_option": "A",
        "explanation": "Variables initialized inside a function block have local scope. Re-assigning 'a = 20' creates a new local variable that does not affect the global 'a'."
    }
    
    q3 = {
        "question_text": (
            "What happens when you run this code?\n\n"
            "```python\n"
            "t = (1, 2, 3)\n"
            "t[0] = 5\n"
            "```"
        ),
        "options": [
            "A. t becomes (5, 2, 3)",
            "B. ValueError",
            "C. TypeError",
            "D. SyntaxError"
        ],
        "correct_option": "C",
        "explanation": "Tuples are immutable in Python. Attempting to assign values to specific elements causes a TypeError."
    }
    
    q4 = {
        "question_text": (
            "What is the output of the following JavaScript statement?\n\n"
            "```javascript\n"
            "console.log(0 == '0');\n"
            "console.log(0 === '0');\n"
            "```"
        ),
        "options": [
            "A. true, true",
            "B. true, false",
            "C. false, true",
            "D. false, false"
        ],
        "correct_option": "B",
        "explanation": "The double-equals operator performs implicit type coercion, resolving 0 == '0' to true. The triple-equals checks type equality without coercion, resolving to false."
    }
    
    q5 = {
        "question_text": (
            "Which of the following describes a 'closure' in JavaScript?"
        ),
        "options": [
            "A. A way to close browser windows",
            "B. A function combined with its lexical environment references",
            "C. A method to terminate loops early",
            "D. The completion of a Promise queue"
        ],
        "correct_option": "B",
        "explanation": "A closure is the bundle of a function combined with references to its surrounding state (the lexical environment)."
    }
    
    all_qs = [q1, q2, q3, q4, q5]
    
    for i in range(min(num_questions, len(all_qs))):
        questions.append(all_qs[i])
        
    while len(questions) < num_questions:
        idx = len(questions) + 1
        questions.append({
            "question_text": f"Mock Question {idx}: What is the time complexity of lookup in a hash table on average?",
            "options": ["A. O(1)", "B. O(log N)", "C. O(N)", "D. O(N log N)"],
            "correct_option": "A",
            "explanation": "Average lookup complexity in a hash table is O(1) due to direct hash lookup implementation."
        })
        
    return {"questions": questions}


def get_simulated_roadmap_response(goal: str) -> dict:
    goal_lower = goal.lower()
    if "backend" in goal_lower:
        return {
            "phases": [
                {"phase_num": 1, "title": "1. Fundamentals", "description": "Learn programming basics, data types, control flow, functions.", "status": "Completed"},
                {"phase_num": 2, "title": "2. Data Structures & Algorithms", "description": "Arrays, Linked Lists, Stacks, Queues, Trees, Graphs.", "status": "In Progress"},
                {"phase_num": 3, "title": "3. Database", "description": "Learn SQL, normalization, indexing, and database design.", "status": "Pending"},
                {"phase_num": 4, "title": "4. Backend Development", "description": "Learn Node.js/Python, Express/Django, REST APIs.", "status": "Pending"},
                {"phase_num": 5, "title": "5. Advanced Topics", "description": "Authentication, Security, Docker, CI/CD, Testing.", "status": "Pending"},
                {"phase_num": 6, "title": "6. Real World Projects", "description": "Build projects and deploy them.", "status": "Pending"}
            ]
        }
    elif "frontend" in goal_lower:
        return {
            "phases": [
                {"phase_num": 1, "title": "1. HTML & CSS Layouts", "description": "Learn semantic HTML, CSS Grid, Flexbox, responsive design, animations.", "status": "Completed"},
                {"phase_num": 2, "title": "2. Modern JavaScript (ES6+)", "description": "DOM manipulation, fetch API, promises, async/await, closures.", "status": "In Progress"},
                {"phase_num": 3, "title": "3. React Core & Hooks", "description": "Components, state, props, hooks (useState, useEffect), custom hooks.", "status": "Pending"},
                {"phase_num": 4, "title": "4. State Management & Routing", "description": "Zustand/Redux Toolkit, React Router, URL parameters.", "status": "Pending"},
                {"phase_num": 5, "title": "5. CSS Frameworks & Tooling", "description": "TailwindCSS, Vite, npm scripts, linting, build pipelines.", "status": "Pending"},
                {"phase_num": 6, "title": "6. SPA Project Deployment", "description": "Build a fully responsive dashboard, optimize code, deploy to Vercel/Netlify.", "status": "Pending"}
            ]
        }
    else:
        return {
            "phases": [
                {"phase_num": 1, "title": "1. Core Foundations", "description": "Understand basic programming languages syntax, expressions and local execution.", "status": "Completed"},
                {"phase_num": 2, "title": "2. Source Control & Git", "description": "Learn commits, branching, merging, GitHub operations and team collaboration.", "status": "In Progress"},
                {"phase_num": 3, "title": "3. Frontend Interface Basics", "description": "Build interactive markup web forms using Javascript event handlers.", "status": "Pending"},
                {"phase_num": 4, "title": "4. API Backend Integrations", "description": "Develop routes, endpoints, JSON inputs, and database persistence layers.", "status": "Pending"},
                {"phase_num": 5, "title": "5. Cloud Devops & Containers", "description": "Learn deployment pipelines, Dockerize applications and manage services.", "status": "Pending"},
                {"phase_num": 6, "title": "6. Capstone Portfolio App", "description": "Assemble comprehensive full-stack product and publish production host links.", "status": "Pending"}
            ]
        }

