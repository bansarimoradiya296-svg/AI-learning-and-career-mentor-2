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
    """
    Comprehensive offline AI mentor response engine.
    Uses keyword matching to provide detailed answers across 40+ programming topics.
    No external API required — runs entirely on Python logic.
    """
    msg_lower = message.lower().strip()

    # ── Python ──────────────────────────────────────────────
    if any(kw in msg_lower for kw in ["python", "pip", "virtualenv", "pep8", "pep 8"]):
        if "list" in msg_lower and ("comprehension" in msg_lower or "comp" in msg_lower):
            return (
                "**List Comprehensions** in Python provide a concise way to create lists.\n\n"
                "**Syntax:**\n"
                "```python\n"
                "new_list = [expression for item in iterable if condition]\n"
                "```\n\n"
                "**Examples:**\n"
                "```python\n"
                "# Squares of numbers 0-9\n"
                "squares = [x**2 for x in range(10)]\n"
                "# Output: [0, 1, 4, 9, 16, 25, 36, 49, 64, 81]\n\n"
                "# Filter even numbers\n"
                "evens = [x for x in range(20) if x % 2 == 0]\n"
                "# Output: [0, 2, 4, 6, 8, 10, 12, 14, 16, 18]\n"
                "```\n\n"
                "List comprehensions are faster than equivalent `for` loops because they are optimized internally by Python."
            )
        elif "decorator" in msg_lower:
            return (
                "**Decorators** in Python are functions that modify the behavior of other functions without changing their code.\n\n"
                "**How they work:**\n"
                "A decorator takes a function as an argument, wraps it with additional logic, and returns the modified function.\n\n"
                "**Example:**\n"
                "```python\n"
                "def my_decorator(func):\n"
                "    def wrapper(*args, **kwargs):\n"
                "        print('Before function call')\n"
                "        result = func(*args, **kwargs)\n"
                "        print('After function call')\n"
                "        return result\n"
                "    return wrapper\n\n"
                "@my_decorator\n"
                "def say_hello(name):\n"
                "    print(f'Hello, {name}!')\n\n"
                "say_hello('World')\n"
                "# Output:\n"
                "# Before function call\n"
                "# Hello, World!\n"
                "# After function call\n"
                "```\n\n"
                "Common built-in decorators include `@staticmethod`, `@classmethod`, and `@property`."
            )
        elif "lambda" in msg_lower:
            return (
                "**Lambda Functions** in Python are small anonymous functions defined with the `lambda` keyword.\n\n"
                "**Syntax:** `lambda arguments: expression`\n\n"
                "**Examples:**\n"
                "```python\n"
                "# Simple lambda\n"
                "square = lambda x: x ** 2\n"
                "print(square(5))  # Output: 25\n\n"
                "# Lambda with multiple arguments\n"
                "add = lambda a, b: a + b\n"
                "print(add(3, 7))  # Output: 10\n\n"
                "# Using lambda with built-in functions\n"
                "numbers = [3, 1, 4, 1, 5, 9]\n"
                "sorted_nums = sorted(numbers, key=lambda x: -x)\n"
                "print(sorted_nums)  # Output: [9, 5, 4, 3, 1, 1]\n"
                "```\n\n"
                "Lambdas are commonly used with `map()`, `filter()`, and `sorted()`."
            )
        elif "generator" in msg_lower or "yield" in msg_lower:
            return (
                "**Generators** in Python are functions that use the `yield` keyword to produce a sequence of values lazily (one at a time).\n\n"
                "**Why use generators?**\n"
                "- Memory efficient — values are generated on-the-fly\n"
                "- Can represent infinite sequences\n"
                "- Faster for large datasets compared to lists\n\n"
                "**Example:**\n"
                "```python\n"
                "def fibonacci(n):\n"
                "    a, b = 0, 1\n"
                "    for _ in range(n):\n"
                "        yield a\n"
                "        a, b = b, a + b\n\n"
                "# Usage\n"
                "for num in fibonacci(10):\n"
                "    print(num, end=' ')\n"
                "# Output: 0 1 1 2 3 5 8 13 21 34\n"
                "```"
            )
        elif "dict" in msg_lower or "dictionary" in msg_lower:
            return (
                "**Dictionaries** in Python are unordered collections of key-value pairs.\n\n"
                "**Creating Dictionaries:**\n"
                "```python\n"
                "# Using curly braces\n"
                "student = {'name': 'Alice', 'age': 22, 'grade': 'A'}\n\n"
                "# Using dict() constructor\n"
                "student = dict(name='Alice', age=22, grade='A')\n"
                "```\n\n"
                "**Common Operations:**\n"
                "```python\n"
                "# Access value\n"
                "print(student['name'])  # Alice\n\n"
                "# Add/Update\n"
                "student['email'] = 'alice@mail.com'\n\n"
                "# Delete\n"
                "del student['grade']\n\n"
                "# Iterate\n"
                "for key, value in student.items():\n"
                "    print(f'{key}: {value}')\n"
                "```\n\n"
                "**Useful methods:** `.get()`, `.keys()`, `.values()`, `.items()`, `.pop()`, `.update()`"
            )
        elif "exception" in msg_lower or "try" in msg_lower or "except" in msg_lower:
            return (
                "**Exception Handling** in Python uses `try`, `except`, `else`, and `finally` blocks.\n\n"
                "```python\n"
                "try:\n"
                "    result = 10 / 0\n"
                "except ZeroDivisionError as e:\n"
                "    print(f'Error: {e}')\n"
                "except Exception as e:\n"
                "    print(f'Unexpected error: {e}')\n"
                "else:\n"
                "    print('No errors occurred')\n"
                "finally:\n"
                "    print('This always executes')\n"
                "```\n\n"
                "**Common Exception Types:**\n"
                "- `ValueError` — wrong value type\n"
                "- `TypeError` — wrong data type\n"
                "- `KeyError` — missing dictionary key\n"
                "- `IndexError` — list index out of range\n"
                "- `FileNotFoundError` — file doesn't exist\n\n"
                "**Custom Exceptions:**\n"
                "```python\n"
                "class CustomError(Exception):\n"
                "    pass\n\n"
                "raise CustomError('Something went wrong')\n"
                "```"
            )
        else:
            return (
                "**Python** is a high-level, interpreted programming language known for its clean syntax and readability.\n\n"
                "**Key Features:**\n"
                "- Easy to learn and write\n"
                "- Dynamically typed\n"
                "- Extensive standard library\n"
                "- Supports OOP, functional, and procedural paradigms\n"
                "- Huge ecosystem (web, AI/ML, data science, scripting)\n\n"
                "**Example — Hello World:**\n"
                "```python\n"
                "print('Hello, World!')\n"
                "```\n\n"
                "**Popular Libraries:**\n"
                "- Web: Flask, Django, FastAPI\n"
                "- Data: Pandas, NumPy, Matplotlib\n"
                "- AI/ML: TensorFlow, PyTorch, scikit-learn\n\n"
                "Feel free to ask about specific Python topics like decorators, generators, list comprehensions, OOP, or anything else!"
            )

    # ── Java ────────────────────────────────────────────────
    if "java" in msg_lower and "javascript" not in msg_lower:
        return (
            "**Java** is a statically-typed, object-oriented programming language that follows the principle of 'Write Once, Run Anywhere' (WORA).\n\n"
            "**Key Features:**\n"
            "- Platform independent (JVM)\n"
            "- Strongly typed with explicit type declarations\n"
            "- Automatic garbage collection\n"
            "- Rich standard library and ecosystem\n\n"
            "**Example — Hello World:**\n"
            "```java\n"
            "public class HelloWorld {\n"
            "    public static void main(String[] args) {\n"
            "        System.out.println(\"Hello, World!\");\n"
            "    }\n"
            "}\n"
            "```\n\n"
            "**Core Concepts:**\n"
            "- Classes and Objects\n"
            "- Inheritance, Polymorphism, Encapsulation, Abstraction\n"
            "- Interfaces and Abstract Classes\n"
            "- Collections Framework (ArrayList, HashMap, etc.)\n"
            "- Exception Handling (try-catch-finally)\n"
            "- Multithreading and Concurrency"
        )

    # ── C Language ──────────────────────────────────────────
    if msg_lower.startswith("c ") or msg_lower == "c" or "c language" in msg_lower or "c programming" in msg_lower or (" c " in f" {msg_lower} " and "c++" not in msg_lower and "c#" not in msg_lower):
        return (
            "**C** is a general-purpose, procedural programming language that provides low-level access to memory.\n\n"
            "**Key Features:**\n"
            "- Fast execution speed\n"
            "- Direct memory manipulation via pointers\n"
            "- Foundation of many modern languages (C++, Java, Python)\n"
            "- Used in operating systems, embedded systems, and drivers\n\n"
            "**Example — Hello World:**\n"
            "```c\n"
            "#include <stdio.h>\n\n"
            "int main() {\n"
            "    printf(\"Hello, World!\\n\");\n"
            "    return 0;\n"
            "}\n"
            "```\n\n"
            "**Core Concepts:**\n"
            "- Variables, Data Types, Operators\n"
            "- Control Flow (if/else, switch, loops)\n"
            "- Functions and Pointers\n"
            "- Arrays and Strings\n"
            "- Structures and Unions\n"
            "- Dynamic Memory Allocation (malloc, calloc, free)"
        )

    # ── C++ ─────────────────────────────────────────────────
    if "c++" in msg_lower or "cpp" in msg_lower:
        return (
            "**C++** is a powerful, general-purpose programming language that extends C with object-oriented features.\n\n"
            "**Key Features:**\n"
            "- Object-Oriented Programming (classes, inheritance, polymorphism)\n"
            "- Low-level memory manipulation (like C)\n"
            "- Standard Template Library (STL)\n"
            "- High performance — used in game engines, system software, competitive programming\n\n"
            "**Example — Hello World:**\n"
            "```cpp\n"
            "#include <iostream>\n"
            "using namespace std;\n\n"
            "int main() {\n"
            "    cout << \"Hello, World!\" << endl;\n"
            "    return 0;\n"
            "}\n"
            "```\n\n"
            "**Core Concepts:**\n"
            "- Classes and Objects\n"
            "- Constructors and Destructors\n"
            "- Operator Overloading\n"
            "- Templates and Generic Programming\n"
            "- STL Containers (vector, map, set, queue, stack)"
        )

    # ── JavaScript ──────────────────────────────────────────
    if "javascript" in msg_lower or "js " in msg_lower or msg_lower == "js" or "node" in msg_lower or "react" in msg_lower or "angular" in msg_lower or "vue" in msg_lower:
        if "closure" in msg_lower:
            return (
                "A **closure** in JavaScript is a function that retains access to its parent scope's variables even after the parent function has returned.\n\n"
                "**Example:**\n"
                "```javascript\n"
                "function createCounter() {\n"
                "    let count = 0;\n"
                "    return function() {\n"
                "        count++;\n"
                "        return count;\n"
                "    };\n"
                "}\n\n"
                "const counter = createCounter();\n"
                "console.log(counter()); // 1\n"
                "console.log(counter()); // 2\n"
                "console.log(counter()); // 3\n"
                "```\n\n"
                "The inner function 'remembers' the `count` variable from its enclosing scope. This is the essence of closures."
            )
        elif "promise" in msg_lower or "async" in msg_lower or "await" in msg_lower:
            return (
                "**Promises and Async/Await** handle asynchronous operations in JavaScript.\n\n"
                "**Promise Example:**\n"
                "```javascript\n"
                "const fetchData = new Promise((resolve, reject) => {\n"
                "    setTimeout(() => resolve('Data received'), 2000);\n"
                "});\n\n"
                "fetchData.then(data => console.log(data));\n"
                "```\n\n"
                "**Async/Await Example:**\n"
                "```javascript\n"
                "async function getData() {\n"
                "    try {\n"
                "        const response = await fetch('https://api.example.com/data');\n"
                "        const data = await response.json();\n"
                "        console.log(data);\n"
                "    } catch (error) {\n"
                "        console.error('Error:', error);\n"
                "    }\n"
                "}\n"
                "```\n\n"
                "`async/await` is syntactic sugar over Promises, making asynchronous code look synchronous and easier to read."
            )
        else:
            return (
                "**JavaScript** is a dynamic, interpreted programming language primarily used for web development.\n\n"
                "**Key Features:**\n"
                "- Runs in browsers and on servers (Node.js)\n"
                "- Event-driven and asynchronous (Promises, async/await)\n"
                "- Prototype-based OOP\n"
                "- First-class functions and closures\n\n"
                "**Example:**\n"
                "```javascript\n"
                "// Arrow function\n"
                "const greet = (name) => `Hello, ${name}!`;\n"
                "console.log(greet('World')); // Hello, World!\n\n"
                "// Array methods\n"
                "const nums = [1, 2, 3, 4, 5];\n"
                "const doubled = nums.map(n => n * 2);\n"
                "console.log(doubled); // [2, 4, 6, 8, 10]\n"
                "```\n\n"
                "**Popular Frameworks:** React, Angular, Vue.js, Express.js, Next.js"
            )

    # ── HTML ────────────────────────────────────────────────
    if "html" in msg_lower:
        return (
            "**HTML (HyperText Markup Language)** is the standard language for creating web pages.\n\n"
            "**Basic Structure:**\n"
            "```html\n"
            "<!DOCTYPE html>\n"
            "<html lang=\"en\">\n"
            "<head>\n"
            "    <meta charset=\"UTF-8\">\n"
            "    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n"
            "    <title>My Page</title>\n"
            "</head>\n"
            "<body>\n"
            "    <h1>Hello, World!</h1>\n"
            "    <p>This is a paragraph.</p>\n"
            "    <a href=\"https://example.com\">Click here</a>\n"
            "</body>\n"
            "</html>\n"
            "```\n\n"
            "**Key Elements:**\n"
            "- `<h1>` to `<h6>` — Headings\n"
            "- `<p>` — Paragraphs\n"
            "- `<a>` — Links\n"
            "- `<img>` — Images\n"
            "- `<div>`, `<span>` — Containers\n"
            "- `<form>`, `<input>`, `<button>` — Forms\n"
            "- Semantic tags: `<header>`, `<nav>`, `<main>`, `<footer>`, `<article>`, `<section>`"
        )

    # ── CSS ─────────────────────────────────────────────────
    if "css" in msg_lower and "flexbox" not in msg_lower and "grid" not in msg_lower:
        return (
            "**CSS (Cascading Style Sheets)** controls the visual presentation of HTML elements.\n\n"
            "**Example:**\n"
            "```css\n"
            "/* Universal reset */\n"
            "* { margin: 0; padding: 0; box-sizing: border-box; }\n\n"
            "body {\n"
            "    font-family: 'Inter', sans-serif;\n"
            "    background-color: #1a1a2e;\n"
            "    color: #eaeaea;\n"
            "}\n\n"
            ".card {\n"
            "    background: linear-gradient(135deg, #667eea, #764ba2);\n"
            "    border-radius: 12px;\n"
            "    padding: 24px;\n"
            "    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);\n"
            "    transition: transform 0.3s ease;\n"
            "}\n\n"
            ".card:hover {\n"
            "    transform: translateY(-4px);\n"
            "}\n"
            "```\n\n"
            "**Key Concepts:** Selectors, Box Model, Flexbox, Grid, Media Queries, Transitions, Animations, Variables (`--custom-property`)."
        )

    if "flexbox" in msg_lower:
        return (
            "**CSS Flexbox** is a one-dimensional layout model for arranging items in rows or columns.\n\n"
            "**Container Properties:**\n"
            "```css\n"
            ".container {\n"
            "    display: flex;\n"
            "    flex-direction: row;        /* row | column */\n"
            "    justify-content: center;    /* flex-start | center | space-between | space-around */\n"
            "    align-items: center;        /* flex-start | center | stretch | baseline */\n"
            "    flex-wrap: wrap;            /* nowrap | wrap */\n"
            "    gap: 16px;\n"
            "}\n"
            "```\n\n"
            "**Item Properties:**\n"
            "```css\n"
            ".item {\n"
            "    flex-grow: 1;     /* How much the item should grow */\n"
            "    flex-shrink: 0;   /* How much it should shrink */\n"
            "    flex-basis: 200px; /* Initial size before growing/shrinking */\n"
            "}\n"
            "```\n\n"
            "Flexbox is ideal for navigation bars, card layouts, centering content, and responsive designs."
        )

    if "grid" in msg_lower and "css" in msg_lower:
        return (
            "**CSS Grid** is a two-dimensional layout system for creating complex web layouts.\n\n"
            "**Example:**\n"
            "```css\n"
            ".grid-container {\n"
            "    display: grid;\n"
            "    grid-template-columns: repeat(3, 1fr);\n"
            "    grid-template-rows: auto;\n"
            "    gap: 20px;\n"
            "    padding: 20px;\n"
            "}\n\n"
            ".grid-item {\n"
            "    background: #2d2d44;\n"
            "    padding: 20px;\n"
            "    border-radius: 8px;\n"
            "}\n\n"
            "/* Span multiple columns */\n"
            ".wide-item {\n"
            "    grid-column: span 2;\n"
            "}\n"
            "```\n\n"
            "Grid is perfect for page layouts, dashboards, and image galleries."
        )

    # ── SQL ─────────────────────────────────────────────────
    if "sql" in msg_lower or "database" in msg_lower or "query" in msg_lower or "select" in msg_lower:
        if "join" in msg_lower:
            return (
                "An **SQL JOIN** clause combines rows from two or more tables based on a related column.\n\n"
                "**Types of JOINs:**\n"
                "- **INNER JOIN:** Returns matching records from both tables\n"
                "- **LEFT JOIN:** All records from the left table + matching from right\n"
                "- **RIGHT JOIN:** All records from the right table + matching from left\n"
                "- **FULL OUTER JOIN:** All records from both tables\n\n"
                "**Example:**\n"
                "```sql\n"
                "SELECT Orders.OrderID, Customers.CustomerName\n"
                "FROM Orders\n"
                "INNER JOIN Customers ON Orders.CustomerID = Customers.CustomerID;\n"
                "```"
            )
        elif "index" in msg_lower:
            return (
                "**SQL Indexes** improve the speed of data retrieval at the cost of additional storage and slower writes.\n\n"
                "**Creating an Index:**\n"
                "```sql\n"
                "CREATE INDEX idx_email ON users(email);\n"
                "CREATE UNIQUE INDEX idx_unique_email ON users(email);\n"
                "```\n\n"
                "**When to use indexes:**\n"
                "- Columns used frequently in WHERE clauses\n"
                "- Columns used in JOIN conditions\n"
                "- Columns used in ORDER BY\n\n"
                "**Avoid indexing:**\n"
                "- Small tables\n"
                "- Columns with low cardinality\n"
                "- Tables with frequent INSERT/UPDATE operations"
            )
        elif "normalization" in msg_lower or "normal form" in msg_lower:
            return (
                "**Database Normalization** organizes data to reduce redundancy and improve integrity.\n\n"
                "**Normal Forms:**\n"
                "- **1NF:** Each column contains atomic (indivisible) values; each row is unique\n"
                "- **2NF:** 1NF + no partial dependency (all non-key columns depend on the entire primary key)\n"
                "- **3NF:** 2NF + no transitive dependency (non-key columns depend only on the primary key)\n"
                "- **BCNF:** Every determinant is a candidate key\n\n"
                "**Example of 1NF violation:**\n"
                "```\n"
                "| Student | Courses         |\n"
                "|---------|----------------|\n"
                "| Alice   | Math, Science  |  ← Multiple values in one column\n"
                "```\n\n"
                "**Fixed (1NF):**\n"
                "```\n"
                "| Student | Course  |\n"
                "|---------|---------|\n"
                "| Alice   | Math    |\n"
                "| Alice   | Science |\n"
                "```"
            )
        else:
            return (
                "**SQL (Structured Query Language)** is used to manage and query relational databases.\n\n"
                "**Essential Commands:**\n"
                "```sql\n"
                "-- Create table\n"
                "CREATE TABLE students (\n"
                "    id INT PRIMARY KEY AUTO_INCREMENT,\n"
                "    name VARCHAR(100) NOT NULL,\n"
                "    email VARCHAR(100) UNIQUE,\n"
                "    age INT\n"
                ");\n\n"
                "-- Insert data\n"
                "INSERT INTO students (name, email, age) VALUES ('Alice', 'alice@mail.com', 22);\n\n"
                "-- Query data\n"
                "SELECT * FROM students WHERE age > 20 ORDER BY name;\n\n"
                "-- Update data\n"
                "UPDATE students SET age = 23 WHERE name = 'Alice';\n\n"
                "-- Delete data\n"
                "DELETE FROM students WHERE id = 1;\n"
                "```\n\n"
                "**Key Concepts:** SELECT, WHERE, JOIN, GROUP BY, HAVING, ORDER BY, subqueries, indexes, normalization."
            )

    # ── Flask ───────────────────────────────────────────────
    if "flask" in msg_lower:
        return (
            "**Flask** is a lightweight Python web framework for building web applications and APIs.\n\n"
            "**Basic App Example:**\n"
            "```python\n"
            "from flask import Flask, jsonify, request\n\n"
            "app = Flask(__name__)\n\n"
            "@app.route('/')\n"
            "def home():\n"
            "    return '<h1>Hello, Flask!</h1>'\n\n"
            "@app.route('/api/greet', methods=['POST'])\n"
            "def greet():\n"
            "    data = request.get_json()\n"
            "    name = data.get('name', 'World')\n"
            "    return jsonify({'message': f'Hello, {name}!'})\n\n"
            "if __name__ == '__main__':\n"
            "    app.run(debug=True)\n"
            "```\n\n"
            "**Key Features:**\n"
            "- Lightweight and modular\n"
            "- Jinja2 templating\n"
            "- Blueprints for modular apps\n"
            "- Extensions: Flask-SQLAlchemy, Flask-Login, Flask-CORS\n"
            "- Great for REST APIs and small-to-medium web apps"
        )

    # ── Django ──────────────────────────────────────────────
    if "django" in msg_lower:
        return (
            "**Django** is a high-level Python web framework that follows the MVT (Model-View-Template) pattern.\n\n"
            "**Key Features:**\n"
            "- Built-in admin panel\n"
            "- ORM (Object-Relational Mapping)\n"
            "- URL routing\n"
            "- Template engine\n"
            "- Authentication system\n"
            "- Security features (CSRF, XSS protection)\n\n"
            "**Quick Start:**\n"
            "```bash\n"
            "pip install django\n"
            "django-admin startproject myproject\n"
            "cd myproject\n"
            "python manage.py runserver\n"
            "```\n\n"
            "**Example View:**\n"
            "```python\n"
            "from django.http import JsonResponse\n\n"
            "def hello(request):\n"
            "    return JsonResponse({'message': 'Hello from Django!'})\n"
            "```\n\n"
            "Django is ideal for large, database-driven web applications with its 'batteries-included' philosophy."
        )

    # ── FastAPI ─────────────────────────────────────────────
    if "fastapi" in msg_lower:
        return (
            "**FastAPI** is a modern, high-performance Python web framework for building APIs.\n\n"
            "**Key Features:**\n"
            "- Automatic API documentation (Swagger/OpenAPI)\n"
            "- Async support out of the box\n"
            "- Type hints and Pydantic validation\n"
            "- Very fast (comparable to Node.js and Go)\n\n"
            "**Example:**\n"
            "```python\n"
            "from fastapi import FastAPI\n"
            "from pydantic import BaseModel\n\n"
            "app = FastAPI()\n\n"
            "class Item(BaseModel):\n"
            "    name: str\n"
            "    price: float\n\n"
            "@app.get('/')\n"
            "async def root():\n"
            "    return {'message': 'Hello, FastAPI!'}\n\n"
            "@app.post('/items')\n"
            "async def create_item(item: Item):\n"
            "    return {'item': item.name, 'price': item.price}\n"
            "```\n\n"
            "Run with: `uvicorn main:app --reload`"
        )

    # ── OOP ─────────────────────────────────────────────────
    if "oop" in msg_lower or "object oriented" in msg_lower or "object-oriented" in msg_lower or "encapsulation" in msg_lower or "polymorphism" in msg_lower or "abstraction" in msg_lower or ("inheritance" in msg_lower and "class" in msg_lower):
        return (
            "**Object-Oriented Programming (OOP)** is a programming paradigm based on the concept of 'objects'.\n\n"
            "**Four Pillars of OOP:**\n\n"
            "**1. Encapsulation** — Bundling data and methods together, hiding internal details.\n"
            "```python\n"
            "class BankAccount:\n"
            "    def __init__(self, balance):\n"
            "        self.__balance = balance  # Private attribute\n"
            "    \n"
            "    def deposit(self, amount):\n"
            "        self.__balance += amount\n"
            "    \n"
            "    def get_balance(self):\n"
            "        return self.__balance\n"
            "```\n\n"
            "**2. Inheritance** — A class inherits properties from a parent class.\n"
            "```python\n"
            "class Animal:\n"
            "    def speak(self):\n"
            "        return 'Some sound'\n\n"
            "class Dog(Animal):\n"
            "    def speak(self):\n"
            "        return 'Woof!'\n"
            "```\n\n"
            "**3. Polymorphism** — Same interface, different implementations.\n\n"
            "**4. Abstraction** — Hiding complex implementation behind simple interfaces."
        )

    # ── Inheritance (standalone) ────────────────────────────
    if "inheritance" in msg_lower:
        return (
            "**Inheritance** allows a class (child) to inherit attributes and methods from another class (parent).\n\n"
            "**Types of Inheritance:**\n"
            "- **Single:** Child inherits from one parent\n"
            "- **Multiple:** Child inherits from multiple parents\n"
            "- **Multilevel:** Chain of inheritance (A → B → C)\n"
            "- **Hierarchical:** Multiple children from one parent\n\n"
            "**Python Example:**\n"
            "```python\n"
            "class Vehicle:\n"
            "    def __init__(self, brand):\n"
            "        self.brand = brand\n"
            "    def honk(self):\n"
            "        print('Beep!')\n\n"
            "class Car(Vehicle):\n"
            "    def __init__(self, brand, model):\n"
            "        super().__init__(brand)\n"
            "        self.model = model\n\n"
            "my_car = Car('Toyota', 'Corolla')\n"
            "my_car.honk()  # Beep!\n"
            "print(my_car.brand)  # Toyota\n"
            "```"
        )

    # ── Machine Learning ────────────────────────────────────
    if "machine learning" in msg_lower or "ml " in msg_lower or msg_lower == "ml":
        return (
            "**Machine Learning (ML)** is a subset of AI that enables systems to learn and improve from data without being explicitly programmed.\n\n"
            "**Types of ML:**\n"
            "- **Supervised Learning:** Training with labeled data (classification, regression)\n"
            "- **Unsupervised Learning:** Finding patterns in unlabeled data (clustering, dimensionality reduction)\n"
            "- **Reinforcement Learning:** Learning through rewards and penalties\n\n"
            "**Popular Algorithms:**\n"
            "- Linear/Logistic Regression\n"
            "- Decision Trees & Random Forests\n"
            "- Support Vector Machines (SVM)\n"
            "- K-Nearest Neighbors (KNN)\n"
            "- Neural Networks\n\n"
            "**Python Example (scikit-learn):**\n"
            "```python\n"
            "from sklearn.model_selection import train_test_split\n"
            "from sklearn.linear_model import LinearRegression\n\n"
            "X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2)\n"
            "model = LinearRegression()\n"
            "model.fit(X_train, y_train)\n"
            "predictions = model.predict(X_test)\n"
            "```\n\n"
            "**Libraries:** scikit-learn, TensorFlow, PyTorch, Keras, XGBoost"
        )

    # ── Artificial Intelligence ─────────────────────────────
    if "artificial intelligence" in msg_lower or msg_lower == "ai" or "ai " in msg_lower or " ai" in msg_lower or "deep learning" in msg_lower or "neural network" in msg_lower:
        return (
            "**Artificial Intelligence (AI)** is the simulation of human intelligence by machines.\n\n"
            "**Branches of AI:**\n"
            "- **Machine Learning:** Learning from data patterns\n"
            "- **Deep Learning:** Neural networks with multiple layers\n"
            "- **Natural Language Processing (NLP):** Understanding human language\n"
            "- **Computer Vision:** Interpreting images and videos\n"
            "- **Robotics:** Autonomous physical systems\n\n"
            "**Deep Learning Example (simple neural network):**\n"
            "```python\n"
            "import tensorflow as tf\n\n"
            "model = tf.keras.Sequential([\n"
            "    tf.keras.layers.Dense(128, activation='relu', input_shape=(784,)),\n"
            "    tf.keras.layers.Dropout(0.2),\n"
            "    tf.keras.layers.Dense(10, activation='softmax')\n"
            "])\n\n"
            "model.compile(optimizer='adam', loss='sparse_categorical_crossentropy', metrics=['accuracy'])\n"
            "```\n\n"
            "**Popular Frameworks:** TensorFlow, PyTorch, Keras, Hugging Face Transformers"
        )

    # ── Data Science ────────────────────────────────────────
    if "data science" in msg_lower or "pandas" in msg_lower or "numpy" in msg_lower or "matplotlib" in msg_lower or "data analysis" in msg_lower:
        return (
            "**Data Science** combines statistics, programming, and domain knowledge to extract insights from data.\n\n"
            "**Core Libraries in Python:**\n\n"
            "**Pandas — Data Manipulation:**\n"
            "```python\n"
            "import pandas as pd\n\n"
            "df = pd.read_csv('data.csv')\n"
            "print(df.head())          # First 5 rows\n"
            "print(df.describe())      # Statistical summary\n"
            "filtered = df[df['age'] > 25]\n"
            "```\n\n"
            "**NumPy — Numerical Computing:**\n"
            "```python\n"
            "import numpy as np\n\n"
            "arr = np.array([1, 2, 3, 4, 5])\n"
            "print(arr.mean())   # 3.0\n"
            "print(arr.std())    # 1.414\n"
            "```\n\n"
            "**Matplotlib — Visualization:**\n"
            "```python\n"
            "import matplotlib.pyplot as plt\n\n"
            "plt.plot([1, 2, 3], [4, 5, 6])\n"
            "plt.xlabel('X')\n"
            "plt.ylabel('Y')\n"
            "plt.title('Simple Plot')\n"
            "plt.show()\n"
            "```\n\n"
            "**Data Science Workflow:** Collect → Clean → Explore → Model → Evaluate → Deploy"
        )

    # ── DBMS ────────────────────────────────────────────────
    if "dbms" in msg_lower or "database management" in msg_lower or "relational database" in msg_lower:
        return (
            "**DBMS (Database Management System)** is software that manages the creation, storage, retrieval, and manipulation of data.\n\n"
            "**Types of DBMS:**\n"
            "- **Relational (RDBMS):** MySQL, PostgreSQL, SQLite, Oracle\n"
            "- **NoSQL:** MongoDB, Redis, Cassandra, Neo4j\n"
            "- **In-Memory:** Redis, Memcached\n\n"
            "**Key Concepts:**\n"
            "- **ACID Properties:** Atomicity, Consistency, Isolation, Durability\n"
            "- **Normalization:** Reducing data redundancy (1NF, 2NF, 3NF, BCNF)\n"
            "- **Indexing:** Speeding up data retrieval\n"
            "- **Transactions:** Grouping operations that must all succeed or all fail\n"
            "- **ER Diagrams:** Entity-Relationship models for database design\n\n"
            "**SQL vs NoSQL:**\n"
            "- SQL: Structured, schema-based, ACID compliant\n"
            "- NoSQL: Flexible schema, horizontally scalable, eventual consistency"
        )

    # ── Operating System ────────────────────────────────────
    if "operating system" in msg_lower or msg_lower == "os" or "os " in msg_lower or "process" in msg_lower and "thread" in msg_lower:
        return (
            "**Operating System (OS)** is system software that manages hardware and software resources.\n\n"
            "**Key Concepts:**\n\n"
            "**1. Process Management:**\n"
            "- Process vs Thread\n"
            "- Process states: New → Ready → Running → Waiting → Terminated\n"
            "- Context switching\n\n"
            "**2. Memory Management:**\n"
            "- Paging and Segmentation\n"
            "- Virtual Memory\n"
            "- Page replacement algorithms (FIFO, LRU, Optimal)\n\n"
            "**3. CPU Scheduling:**\n"
            "- FCFS, SJF, Round Robin, Priority Scheduling\n"
            "- Preemptive vs Non-preemptive\n\n"
            "**4. Deadlock:**\n"
            "- Conditions: Mutual Exclusion, Hold & Wait, No Preemption, Circular Wait\n"
            "- Prevention, Avoidance (Banker's Algorithm), Detection\n\n"
            "**5. File Systems:**\n"
            "- File allocation methods\n"
            "- Directory structures\n"
            "- Disk scheduling (FCFS, SSTF, SCAN, C-SCAN)"
        )

    # ── Networking ──────────────────────────────────────────
    if "network" in msg_lower or "tcp" in msg_lower or "udp" in msg_lower or "http" in msg_lower or "ip address" in msg_lower or "osi" in msg_lower or "dns" in msg_lower:
        return (
            "**Computer Networking** involves connecting computers to share data and resources.\n\n"
            "**OSI Model (7 Layers):**\n"
            "1. **Physical** — Cables, signals, bits\n"
            "2. **Data Link** — MAC addresses, frames\n"
            "3. **Network** — IP addressing, routing\n"
            "4. **Transport** — TCP/UDP, port numbers\n"
            "5. **Session** — Connection management\n"
            "6. **Presentation** — Encryption, compression\n"
            "7. **Application** — HTTP, FTP, SMTP, DNS\n\n"
            "**TCP vs UDP:**\n"
            "- **TCP:** Reliable, ordered delivery, connection-oriented (HTTP, FTP, email)\n"
            "- **UDP:** Fast, unreliable, connectionless (streaming, gaming, DNS)\n\n"
            "**Key Concepts:**\n"
            "- IP Addressing (IPv4/IPv6)\n"
            "- Subnetting and CIDR\n"
            "- DNS resolution\n"
            "- HTTP/HTTPS protocols\n"
            "- REST APIs and WebSockets"
        )

    # ── Git / GitHub ────────────────────────────────────────
    if "git" in msg_lower or "github" in msg_lower or "version control" in msg_lower:
        return (
            "**Git** is a distributed version control system for tracking code changes.\n\n"
            "**Essential Commands:**\n"
            "```bash\n"
            "# Initialize repo\n"
            "git init\n\n"
            "# Stage and commit\n"
            "git add .\n"
            "git commit -m 'Initial commit'\n\n"
            "# Branching\n"
            "git branch feature-login\n"
            "git checkout feature-login\n"
            "# or: git checkout -b feature-login\n\n"
            "# Merge\n"
            "git checkout main\n"
            "git merge feature-login\n\n"
            "# Remote operations\n"
            "git remote add origin https://github.com/user/repo.git\n"
            "git push -u origin main\n"
            "git pull origin main\n\n"
            "# View history\n"
            "git log --oneline --graph\n"
            "```\n\n"
            "**GitHub** adds collaboration features: Pull Requests, Issues, Actions (CI/CD), Forks, and code reviews.\n\n"
            "**Best Practices:**\n"
            "- Write meaningful commit messages\n"
            "- Use feature branches\n"
            "- Review code through Pull Requests\n"
            "- Never commit secrets or API keys"
        )

    # ── Recursion ───────────────────────────────────────────
    if "recursion" in msg_lower or "recursive" in msg_lower:
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
            "        return n * factorial(n - 1)\n\n"
            "print(factorial(5))  # Output: 120\n"
            "```\n\n"
            "**More Examples:**\n"
            "```python\n"
            "# Fibonacci\n"
            "def fibonacci(n):\n"
            "    if n <= 1:\n"
            "        return n\n"
            "    return fibonacci(n-1) + fibonacci(n-2)\n\n"
            "# Sum of list\n"
            "def sum_list(lst):\n"
            "    if not lst:\n"
            "        return 0\n"
            "    return lst[0] + sum_list(lst[1:])\n"
            "```\n\n"
            "**Common pitfall:** Missing or incorrect base case leads to infinite recursion and a `RecursionError`."
        )

    # ── Algorithms ──────────────────────────────────────────
    if "algorithm" in msg_lower or "sorting" in msg_lower or "searching" in msg_lower or "big o" in msg_lower or "time complexity" in msg_lower or "space complexity" in msg_lower:
        if "binary search" in msg_lower:
            return (
                "**Binary Search** efficiently finds an item in a sorted list by repeatedly dividing the search space in half.\n\n"
                "**Time Complexity:** O(log N)\n"
                "**Space Complexity:** O(1) iterative, O(log N) recursive\n\n"
                "**Python Implementation:**\n"
                "```python\n"
                "def binary_search(arr, target):\n"
                "    left, right = 0, len(arr) - 1\n"
                "    while left <= right:\n"
                "        mid = (left + right) // 2\n"
                "        if arr[mid] == target:\n"
                "            return mid\n"
                "        elif arr[mid] < target:\n"
                "            left = mid + 1\n"
                "        else:\n"
                "            right = mid - 1\n"
                "    return -1\n"
                "```"
            )
        elif "sorting" in msg_lower or "sort" in msg_lower:
            return (
                "**Common Sorting Algorithms:**\n\n"
                "| Algorithm      | Best    | Average  | Worst    | Space  | Stable |\n"
                "|---------------|---------|----------|----------|--------|--------|\n"
                "| Bubble Sort   | O(n)    | O(n²)    | O(n²)    | O(1)   | Yes    |\n"
                "| Selection Sort| O(n²)   | O(n²)    | O(n²)    | O(1)   | No     |\n"
                "| Insertion Sort| O(n)    | O(n²)    | O(n²)    | O(1)   | Yes    |\n"
                "| Merge Sort    | O(n log n)| O(n log n)| O(n log n)| O(n)| Yes    |\n"
                "| Quick Sort    | O(n log n)| O(n log n)| O(n²)  | O(log n)| No   |\n\n"
                "**Quick Sort Example (Python):**\n"
                "```python\n"
                "def quicksort(arr):\n"
                "    if len(arr) <= 1:\n"
                "        return arr\n"
                "    pivot = arr[len(arr) // 2]\n"
                "    left = [x for x in arr if x < pivot]\n"
                "    middle = [x for x in arr if x == pivot]\n"
                "    right = [x for x in arr if x > pivot]\n"
                "    return quicksort(left) + middle + quicksort(right)\n"
                "```"
            )
        else:
            return (
                "**Algorithm Complexity (Big O Notation)**\n\n"
                "Big O describes how an algorithm's time or space requirements grow as input size increases.\n\n"
                "**Common Complexities (fastest to slowest):**\n"
                "- **O(1)** — Constant: Hash table lookup\n"
                "- **O(log n)** — Logarithmic: Binary search\n"
                "- **O(n)** — Linear: Simple loop\n"
                "- **O(n log n)** — Linearithmic: Merge sort, Quick sort\n"
                "- **O(n²)** — Quadratic: Nested loops, Bubble sort\n"
                "- **O(2ⁿ)** — Exponential: Recursive Fibonacci\n"
                "- **O(n!)** — Factorial: Permutations\n\n"
                "**Example:**\n"
                "```python\n"
                "# O(n) — Linear time\n"
                "def find_max(arr):\n"
                "    max_val = arr[0]\n"
                "    for num in arr:\n"
                "        if num > max_val:\n"
                "            max_val = num\n"
                "    return max_val\n"
                "```"
            )

    # ── Data Structures ─────────────────────────────────────
    if "data structure" in msg_lower or "linked list" in msg_lower or "stack" in msg_lower or "queue" in msg_lower or "tree" in msg_lower or "graph" in msg_lower or "hash" in msg_lower or "heap" in msg_lower:
        if "linked list" in msg_lower:
            return (
                "A **Linked List** is a linear data structure where elements are stored in nodes, each pointing to the next.\n\n"
                "**Types:**\n"
                "- Singly Linked List (each node → next)\n"
                "- Doubly Linked List (prev ← node → next)\n"
                "- Circular Linked List\n\n"
                "**Python Implementation:**\n"
                "```python\n"
                "class Node:\n"
                "    def __init__(self, data):\n"
                "        self.data = data\n"
                "        self.next = None\n\n"
                "class LinkedList:\n"
                "    def __init__(self):\n"
                "        self.head = None\n"
                "    \n"
                "    def append(self, data):\n"
                "        new_node = Node(data)\n"
                "        if not self.head:\n"
                "            self.head = new_node\n"
                "            return\n"
                "        current = self.head\n"
                "        while current.next:\n"
                "            current = current.next\n"
                "        current.next = new_node\n"
                "```\n\n"
                "**Time Complexity:** Access O(n), Search O(n), Insert O(1), Delete O(1)"
            )
        elif "stack" in msg_lower:
            return (
                "A **Stack** is a LIFO (Last In, First Out) data structure.\n\n"
                "**Operations:**\n"
                "- `push(item)` — Add to top\n"
                "- `pop()` — Remove from top\n"
                "- `peek()` — View top without removing\n"
                "- `isEmpty()` — Check if empty\n\n"
                "**Python Implementation:**\n"
                "```python\n"
                "class Stack:\n"
                "    def __init__(self):\n"
                "        self.items = []\n"
                "    \n"
                "    def push(self, item):\n"
                "        self.items.append(item)\n"
                "    \n"
                "    def pop(self):\n"
                "        return self.items.pop() if self.items else None\n"
                "    \n"
                "    def peek(self):\n"
                "        return self.items[-1] if self.items else None\n"
                "    \n"
                "    def is_empty(self):\n"
                "        return len(self.items) == 0\n"
                "```\n\n"
                "**Use Cases:** Undo/Redo, browser back button, expression evaluation, DFS traversal."
            )
        elif "queue" in msg_lower:
            return (
                "A **Queue** is a FIFO (First In, First Out) data structure.\n\n"
                "**Operations:**\n"
                "- `enqueue(item)` — Add to back\n"
                "- `dequeue()` — Remove from front\n"
                "- `peek()` — View front element\n\n"
                "**Python Implementation:**\n"
                "```python\n"
                "from collections import deque\n\n"
                "queue = deque()\n"
                "queue.append('A')    # Enqueue\n"
                "queue.append('B')\n"
                "queue.popleft()      # Dequeue → 'A'\n"
                "```\n\n"
                "**Variants:**\n"
                "- **Priority Queue:** Elements dequeued by priority (use `heapq`)\n"
                "- **Circular Queue:** Wraps around to reuse space\n"
                "- **Deque:** Double-ended queue — insert/remove from both ends\n\n"
                "**Use Cases:** BFS traversal, task scheduling, print queues, buffering."
            )
        elif "tree" in msg_lower or "bst" in msg_lower or "binary tree" in msg_lower:
            return (
                "A **Tree** is a hierarchical data structure with nodes connected by edges.\n\n"
                "**Types:**\n"
                "- **Binary Tree:** Each node has at most 2 children\n"
                "- **Binary Search Tree (BST):** Left < Parent < Right\n"
                "- **AVL Tree:** Self-balancing BST\n"
                "- **Heap:** Complete binary tree with heap property\n\n"
                "**BST Implementation:**\n"
                "```python\n"
                "class TreeNode:\n"
                "    def __init__(self, val):\n"
                "        self.val = val\n"
                "        self.left = None\n"
                "        self.right = None\n\n"
                "def insert(root, val):\n"
                "    if not root:\n"
                "        return TreeNode(val)\n"
                "    if val < root.val:\n"
                "        root.left = insert(root.left, val)\n"
                "    else:\n"
                "        root.right = insert(root.right, val)\n"
                "    return root\n"
                "```\n\n"
                "**Traversals:** Inorder (LNR), Preorder (NLR), Postorder (LRN), Level-order (BFS)"
            )
        else:
            return (
                "**Common Data Structures:**\n\n"
                "| Structure    | Access | Search | Insert | Delete |\n"
                "|-------------|--------|--------|--------|--------|\n"
                "| Array       | O(1)   | O(n)   | O(n)   | O(n)   |\n"
                "| Linked List | O(n)   | O(n)   | O(1)   | O(1)   |\n"
                "| Stack       | O(n)   | O(n)   | O(1)   | O(1)   |\n"
                "| Queue       | O(n)   | O(n)   | O(1)   | O(1)   |\n"
                "| Hash Table  | N/A    | O(1)   | O(1)   | O(1)   |\n"
                "| BST         | O(log n)| O(log n)| O(log n)| O(log n)|\n\n"
                "Choose the right data structure based on:\n"
                "- **Frequency of operations** (read-heavy vs write-heavy)\n"
                "- **Memory constraints**\n"
                "- **Ordering requirements**"
            )

    # ── Coding Interview ────────────────────────────────────
    if "interview" in msg_lower or "coding interview" in msg_lower or "dsa" in msg_lower:
        return (
            "**Coding Interview Preparation Guide:**\n\n"
            "**1. Master Core Data Structures:**\n"
            "- Arrays, Strings, Linked Lists\n"
            "- Stacks, Queues, Hash Maps\n"
            "- Trees, Graphs, Heaps\n\n"
            "**2. Key Algorithm Patterns:**\n"
            "- Two Pointers / Sliding Window\n"
            "- Binary Search\n"
            "- BFS / DFS\n"
            "- Dynamic Programming\n"
            "- Backtracking\n"
            "- Greedy Algorithms\n\n"
            "**3. Practice Strategy:**\n"
            "- Start with Easy problems, move to Medium\n"
            "- Focus on understanding patterns, not memorizing solutions\n"
            "- Practice explaining your thought process aloud\n"
            "- Time yourself (aim for 20-30 min per problem)\n\n"
            "**4. Common Interview Questions:**\n"
            "- Two Sum, Reverse Linked List\n"
            "- Valid Parentheses, Merge Intervals\n"
            "- Binary Tree Level Order Traversal\n"
            "- Longest Substring Without Repeating Characters\n\n"
            "**5. System Design (for senior roles):**\n"
            "- URL Shortener, Chat System, Rate Limiter\n"
            "- Scalability, Load Balancing, Caching"
        )

    # ── Career Guidance ─────────────────────────────────────
    if "career" in msg_lower or "job" in msg_lower or "resume" in msg_lower or "portfolio" in msg_lower or "roadmap" in msg_lower or "salary" in msg_lower or "fresher" in msg_lower:
        return (
            "**Career Guidance for Developers:**\n\n"
            "**1. Build a Strong Foundation:**\n"
            "- Master one programming language deeply\n"
            "- Understand Data Structures & Algorithms\n"
            "- Learn Git and version control\n\n"
            "**2. Choose a Specialization:**\n"
            "- **Frontend:** HTML, CSS, JavaScript, React/Vue\n"
            "- **Backend:** Python/Node.js, REST APIs, Databases\n"
            "- **Full Stack:** Both frontend + backend\n"
            "- **Data Science / ML:** Python, Statistics, ML frameworks\n"
            "- **DevOps:** Docker, CI/CD, Cloud (AWS/GCP/Azure)\n"
            "- **Mobile:** React Native, Flutter, Swift, Kotlin\n\n"
            "**3. Build Your Portfolio:**\n"
            "- Create 3-5 quality projects on GitHub\n"
            "- Deploy projects with live demos\n"
            "- Write clean, documented code\n"
            "- Contribute to open source\n\n"
            "**4. Prepare for Interviews:**\n"
            "- Practice DSA problems regularly\n"
            "- Prepare behavioral questions (STAR method)\n"
            "- Research the company before interviews\n\n"
            "**5. Networking:**\n"
            "- LinkedIn profile optimization\n"
            "- Tech meetups and conferences\n"
            "- Open source contributions"
        )

    # ── Debugging ───────────────────────────────────────────
    if "debug" in msg_lower or "error" in msg_lower or "bug" in msg_lower or "fix" in msg_lower or "traceback" in msg_lower:
        if "nonetype" in msg_lower and "append" in msg_lower:
            return (
                "This error occurs because you're trying to call `append()` on a variable that is `None`.\n\n"
                "**Reason:** The variable is `None`, meaning it doesn't point to a list.\n\n"
                "**How to Fix:** Initialize with an empty list `[]` before using `append()`.\n\n"
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
        else:
            return (
                "**Debugging Tips & Strategies:**\n\n"
                "**1. Read the Error Message Carefully:**\n"
                "- Error type (TypeError, ValueError, etc.)\n"
                "- Line number and file\n"
                "- Stack trace (read bottom to top)\n\n"
                "**2. Common Debugging Techniques:**\n"
                "- **Print Debugging:** Add `print()` statements to trace values\n"
                "- **Breakpoints:** Use IDE debugger (VS Code, PyCharm)\n"
                "- **Rubber Duck:** Explain your code to someone (or something)\n"
                "- **Binary Search:** Comment out half the code to isolate the bug\n\n"
                "**3. Common Python Errors:**\n"
                "- `NameError` — Variable not defined\n"
                "- `TypeError` — Wrong type operation (e.g., `'1' + 2`)\n"
                "- `IndexError` — List index out of range\n"
                "- `KeyError` — Missing dictionary key\n"
                "- `IndentationError` — Incorrect indentation\n\n"
                "**4. Prevention:**\n"
                "- Write unit tests\n"
                "- Use type hints and linters\n"
                "- Handle exceptions with try/except\n"
                "- Review code before committing"
            )

    # ── Dynamic Programming ─────────────────────────────────
    if "dynamic programming" in msg_lower or " dp " in f" {msg_lower} " or "memoization" in msg_lower or "tabulation" in msg_lower:
        return (
            "**Dynamic Programming (DP)** solves complex problems by breaking them into overlapping subproblems.\n\n"
            "**Two Approaches:**\n"
            "1. **Top-Down (Memoization):** Recursive + cache results\n"
            "2. **Bottom-Up (Tabulation):** Iterative, build solution from base case\n\n"
            "**Example — Fibonacci:**\n"
            "```python\n"
            "# Top-Down (Memoization)\n"
            "def fib_memo(n, memo={}):\n"
            "    if n in memo:\n"
            "        return memo[n]\n"
            "    if n <= 1:\n"
            "        return n\n"
            "    memo[n] = fib_memo(n-1, memo) + fib_memo(n-2, memo)\n"
            "    return memo[n]\n\n"
            "# Bottom-Up (Tabulation)\n"
            "def fib_tab(n):\n"
            "    dp = [0, 1]\n"
            "    for i in range(2, n+1):\n"
            "        dp.append(dp[i-1] + dp[i-2])\n"
            "    return dp[n]\n"
            "```\n\n"
            "**Classic DP Problems:**\n"
            "- 0/1 Knapsack, Coin Change\n"
            "- Longest Common Subsequence (LCS)\n"
            "- Longest Increasing Subsequence (LIS)\n"
            "- Matrix Chain Multiplication\n"
            "- Edit Distance"
        )

    # ── API / REST ──────────────────────────────────────────
    if "api" in msg_lower or "rest" in msg_lower or "endpoint" in msg_lower:
        return (
            "**REST API (Representational State Transfer)** is an architectural style for designing networked applications.\n\n"
            "**HTTP Methods:**\n"
            "- **GET** — Retrieve data\n"
            "- **POST** — Create new resource\n"
            "- **PUT** — Update existing resource (full)\n"
            "- **PATCH** — Update existing resource (partial)\n"
            "- **DELETE** — Remove resource\n\n"
            "**Status Codes:**\n"
            "- `200 OK` — Success\n"
            "- `201 Created` — Resource created\n"
            "- `400 Bad Request` — Invalid input\n"
            "- `401 Unauthorized` — Authentication required\n"
            "- `404 Not Found` — Resource doesn't exist\n"
            "- `500 Internal Server Error` — Server failure\n\n"
            "**Example (Python requests):**\n"
            "```python\n"
            "import requests\n\n"
            "# GET request\n"
            "response = requests.get('https://api.example.com/users')\n"
            "data = response.json()\n\n"
            "# POST request\n"
            "new_user = {'name': 'Alice', 'email': 'alice@mail.com'}\n"
            "response = requests.post('https://api.example.com/users', json=new_user)\n"
            "```"
        )

    # ── Design Patterns ─────────────────────────────────────
    if "design pattern" in msg_lower or "singleton" in msg_lower or "factory" in msg_lower or "observer" in msg_lower:
        return (
            "**Design Patterns** are reusable solutions to common software design problems.\n\n"
            "**Creational Patterns:**\n"
            "- **Singleton:** Only one instance of a class\n"
            "- **Factory:** Create objects without specifying exact class\n"
            "- **Builder:** Construct complex objects step by step\n\n"
            "**Structural Patterns:**\n"
            "- **Adapter:** Make incompatible interfaces work together\n"
            "- **Decorator:** Add behavior to objects dynamically\n"
            "- **Facade:** Simplify complex subsystem interfaces\n\n"
            "**Behavioral Patterns:**\n"
            "- **Observer:** Notify multiple objects of state changes\n"
            "- **Strategy:** Switch algorithms at runtime\n"
            "- **Command:** Encapsulate actions as objects\n\n"
            "**Singleton Example (Python):**\n"
            "```python\n"
            "class Database:\n"
            "    _instance = None\n"
            "    \n"
            "    def __new__(cls):\n"
            "        if cls._instance is None:\n"
            "            cls._instance = super().__new__(cls)\n"
            "        return cls._instance\n"
            "```"
        )

    # ── Docker / DevOps ─────────────────────────────────────
    if "docker" in msg_lower or "container" in msg_lower or "devops" in msg_lower or "ci/cd" in msg_lower or "kubernetes" in msg_lower:
        return (
            "**Docker** packages applications into containers for consistent deployment across environments.\n\n"
            "**Key Commands:**\n"
            "```bash\n"
            "# Build an image\n"
            "docker build -t myapp:latest .\n\n"
            "# Run a container\n"
            "docker run -d -p 8080:80 myapp:latest\n\n"
            "# List running containers\n"
            "docker ps\n\n"
            "# Docker Compose (multi-container)\n"
            "docker-compose up -d\n"
            "```\n\n"
            "**Dockerfile Example:**\n"
            "```dockerfile\n"
            "FROM python:3.11-slim\n"
            "WORKDIR /app\n"
            "COPY requirements.txt .\n"
            "RUN pip install -r requirements.txt\n"
            "COPY . .\n"
            "CMD [\"python\", \"app.py\"]\n"
            "```\n\n"
            "**DevOps Pipeline:** Code → Build → Test → Deploy → Monitor"
        )

    # ── Middleware ───────────────────────────────────────────
    if "middleware" in msg_lower:
        return (
            "**Middleware** functions intercept requests and responses in web frameworks.\n\n"
            "**Express.js Example:**\n"
            "```javascript\n"
            "const loggerMiddleware = (req, res, next) => {\n"
            "    console.log(`${req.method} ${req.url}`);\n"
            "    next(); // Pass control to next handler\n"
            "};\n"
            "```\n\n"
            "**FastAPI Example:**\n"
            "```python\n"
            "from fastapi import FastAPI, Request\n\n"
            "app = FastAPI()\n\n"
            "@app.middleware('http')\n"
            "async def log_requests(request: Request, call_next):\n"
            "    print(f'{request.method} {request.url}')\n"
            "    response = await call_next(request)\n"
            "    return response\n"
            "```\n\n"
            "**Common Uses:** Logging, authentication, CORS, rate limiting, error handling."
        )

    # ── Hello / Greeting ────────────────────────────────────
    if any(kw in msg_lower for kw in ["hello", "hi", "hey", "good morning", "good evening", "what's up", "howdy"]):
        return (
            "Hello! 👋 I'm your **AI Coding Mentor**.\n\n"
            "I can help you with:\n"
            "- 🐍 **Programming Languages** — Python, Java, C, C++, JavaScript, HTML, CSS, SQL\n"
            "- 🌐 **Web Frameworks** — Flask, Django, FastAPI, React, Node.js\n"
            "- 🧠 **CS Fundamentals** — OOP, DBMS, Operating Systems, Networking\n"
            "- 📊 **Data Science & AI** — Machine Learning, Deep Learning, Pandas, NumPy\n"
            "- 🔧 **DevOps** — Git, GitHub, Docker, CI/CD\n"
            "- 🏗️ **Data Structures & Algorithms** — Arrays, Trees, Graphs, Sorting, DP\n"
            "- 💼 **Career Guidance** — Resume tips, interview prep, roadmaps\n"
            "- 🐛 **Debugging** — Error analysis, code fixes, best practices\n\n"
            "Just ask me anything programming-related and I'll provide detailed explanations with code examples!"
        )

    # ── What can you do ─────────────────────────────────────
    if any(kw in msg_lower for kw in ["what can you do", "help me", "what do you do", "how can you help", "your capabilities", "features"]):
        return (
            "I'm your **AI Coding Mentor** and I can assist with:\n\n"
            "📚 **Programming Languages:** Python, Java, C, C++, JavaScript, HTML, CSS, SQL\n"
            "🌐 **Web Development:** Flask, Django, FastAPI, React, Node.js, REST APIs\n"
            "🧠 **Computer Science:** OOP, DBMS, OS, Networking, Design Patterns\n"
            "📊 **Data & AI:** Data Science, Machine Learning, Deep Learning\n"
            "🏗️ **DSA:** Data Structures, Algorithms, Complexity Analysis\n"
            "🔧 **Tools:** Git, GitHub, Docker, CI/CD\n"
            "💼 **Career:** Interview prep, Resume building, Learning roadmaps\n"
            "🐛 **Debugging:** Error analysis, Code review, Best practices\n\n"
            "Ask me any question and I'll provide a detailed answer with code examples!"
        )

    # ── Catch-all: smart fallback ───────────────────────────
    # Try to extract topic keywords and give a contextual response
    topic_keywords = {
        "loop": "loops", "for": "for loops", "while": "while loops",
        "function": "functions", "class": "classes", "variable": "variables",
        "array": "arrays", "string": "strings", "pointer": "pointers",
        "struct": "structures", "enum": "enumerations", "tuple": "tuples",
        "set": "sets", "map": "maps", "regex": "regular expressions",
        "file": "file handling", "socket": "socket programming",
        "thread": "multithreading", "process": "multiprocessing",
        "encryption": "encryption", "security": "cybersecurity",
        "testing": "software testing", "unit test": "unit testing",
        "agile": "Agile methodology", "scrum": "Scrum framework",
        "linux": "Linux", "command line": "command line usage",
        "terminal": "terminal commands", "bash": "Bash scripting",
        "json": "JSON format", "xml": "XML format", "yaml": "YAML format",
        "websocket": "WebSockets", "graphql": "GraphQL",
        "typescript": "TypeScript", "rust": "Rust language",
        "go": "Go language", "kotlin": "Kotlin", "swift": "Swift",
        "terraform": "Terraform", "aws": "AWS cloud",
    }

    for keyword, topic in topic_keywords.items():
        if keyword in msg_lower:
            return (
                f"Great question about **{topic}**! 🎯\n\n"
                f"This is an important concept in programming. Here's a brief overview:\n\n"
                f"**{topic.title()}** is a fundamental topic that developers encounter regularly. "
                f"Understanding it well will help you write better, more efficient code.\n\n"
                f"**Key Points:**\n"
                f"- Study official documentation for your language of choice\n"
                f"- Practice with small code examples\n"
                f"- Build projects that use this concept\n"
                f"- Explore related topics for deeper understanding\n\n"
                f"Feel free to ask a more specific question about {topic} and I'll provide "
                f"detailed code examples and explanations!"
            )

    # ── Non-programming question handler ────────────────────
    non_programming = ["weather", "recipe", "cook", "movie", "music", "sport", "game score", "celebrity", "politics", "religion"]
    if any(kw in msg_lower for kw in non_programming):
        return (
            "I appreciate your curiosity! 😊 However, I'm specifically designed to help with **programming and career guidance** topics.\n\n"
            "I can help you with:\n"
            "- Programming languages (Python, Java, C++, JS, etc.)\n"
            "- Web development (Flask, Django, React, etc.)\n"
            "- Data structures & algorithms\n"
            "- Database concepts\n"
            "- Career guidance & interview prep\n"
            "- Debugging and code review\n\n"
            "Feel free to ask any programming-related question!"
        )

    # ── Final fallback ──────────────────────────────────────
    return (
        f"Thank you for your question! I'm your AI Coding Mentor and I'm here to help. 🚀\n\n"
        f"While I don't have a specific pre-built answer for your exact query, here are some tips:\n\n"
        f"**Your Question:** *\"{message[:100]}{'...' if len(message) > 100 else ''}\"*\n\n"
        f"I work best with specific programming questions like:\n"
        f"- \"Explain recursion with an example\"\n"
        f"- \"How do Python decorators work?\"\n"
        f"- \"What is the difference between TCP and UDP?\"\n"
        f"- \"Show me a binary search implementation\"\n"
        f"- \"How to prepare for coding interviews?\"\n\n"
        f"**Topics I cover:**\n"
        f"Python, Java, C, C++, JavaScript, HTML, CSS, SQL, Flask, Django, "
        f"Machine Learning, AI, Data Science, OOP, DBMS, OS, Networking, "
        f"Git, Algorithms, Data Structures, Career Guidance, and more!\n\n"
        f"Try rephrasing your question with more specific keywords and I'll provide a detailed answer with code examples!"
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

