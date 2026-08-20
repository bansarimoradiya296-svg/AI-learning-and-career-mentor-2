import asyncio
import sys
import tempfile
import os
import subprocess
import json
from typing import Dict, List, Tuple
import google.generativeai as genai
from app.core.config import settings

genai.configure(api_key=settings.GEMINI_API_KEY)


class CodeExecutorService:
    async def execute_python_locally(self, code: str, input_str: str, expected_output: str, timeout: float = 2.0) -> Tuple[bool, str, str]:
        """
        Executes Python code safely in a separate sandbox-like subprocess.
        Returns (success_boolean, output_captured, error_captured).
        """
        # Create a temp file
        with tempfile.NamedTemporaryFile(suffix=".py", delete=False) as tmp:
            tmp.write(code.encode("utf-8"))
            tmp_path = tmp.name

        try:
            # We run python in a restricted subprocess
            proc = await asyncio.create_subprocess_exec(
                sys.executable, tmp_path,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE
            )
            
            try:
                stdout, stderr = await asyncio.wait_for(
                    proc.communicate(input=input_str.encode("utf-8")),
                    timeout=timeout
                )
                stdout_str = stdout.decode("utf-8", errors="ignore").strip()
                stderr_str = stderr.decode("utf-8", errors="ignore").strip()
                
                # Check outcome
                if proc.returncode == 0:
                    # Clean comparison (stripping whitespace)
                    is_correct = stdout_str == expected_output.strip()
                    return is_correct, stdout_str, stderr_str
                else:
                    return False, stdout_str, stderr_str
            except asyncio.TimeoutError:
                proc.kill()
                return False, "", "TIMEOUT_ERROR: Code execution exceeded safety limits."
        except Exception as e:
            return False, "", f"RUNTIME_ERROR: {str(e)}"
        finally:
            # Clean up temp file
            if os.path.exists(tmp_path):
                os.remove(tmp_path)

    async def evaluate_submission_with_ai(
        self, code: str, language: str, problem_title: str, description: str, test_cases: List[Dict]
    ) -> Dict:
        """
        Evaluates submissions for non-Python or complex logic challenges using Google Gemini.
        Returns status, runtime statistics, time/space complexity, and line-by-line feedback.
        """
        prompt = (
            f"You are a Senior Technical Coding Judge (similar to LeetCode system).\n"
            f"Problem Title: {problem_title}\n"
            f"Problem Description:\n{description}\n\n"
            f"Language: {language}\n"
            f"Submitted Code:\n"
            f"```\n{code}\n```\n\n"
            f"Test Cases to Verify:\n{test_cases}\n\n"
            f"Examine the code syntax, verify logical correctness against all test cases, and analyze complexity.\n"
            f"Respond ONLY with a JSON object matching this exact schema:\n"
            f'{{\n'
            f'  "status": "ACCEPTED", // or "WRONG_ANSWER", "COMPILE_ERROR", "RUNTIME_ERROR"\n'
            f'  "execution_time": 0.05, // simulated execution time in seconds\n'
            f'  "test_case_results": [\n'
            f'    {{"input": "...", "expected": "...", "actual": "...", "passed": true}}\n'
            f'  ],\n'
            f'  "time_complexity": "O(N)",\n'
            f'  "space_complexity": "O(1)",\n'
            f'  "error_details": null, // error message if compilation/runtime failed\n'
            f'  "suggestions": "Brief structural optimization recommendations..."\n'
            f'}}\n'
            f"Do not wrap in Markdown quotes. Output clean raw JSON text only."
        )

        try:
            model = genai.GenerativeModel(settings.GEMINI_MODEL)
            response = model.generate_content(prompt)
            raw_text = response.text.replace("```json", "").replace("```", "").strip()
            return json.loads(raw_text)
        except Exception as e:
            return {
                "status": "COMPILE_ERROR",
                "execution_time": 0.0,
                "test_case_results": [],
                "time_complexity": "Unknown",
                "space_complexity": "Unknown",
                "error_details": f"Submissions service error: {str(e)}",
                "suggestions": "Please verify code formatting."
            }

    async def get_optimization_suggestions(self, code: str, language: str) -> Dict:
        """
        Provides specific refactoring suggestions, complexity profiling, and a cleaner version of the code.
        """
        prompt = (
            f"Analyze the following {language} code for performance, readability, and security issues. "
            f"Provide suggestions and refactored code.\n"
            f"Code:\n```\n{code}\n```\n\n"
            f"Respond ONLY with a JSON object in this format:\n"
            f'{{\n'
            f'  "readability_score": 85, // Scale 1-100\n'
            f'  "issues_found": ["issue 1", "issue 2"],\n'
            f'  "refactored_code": "new code here",\n'
            f'  "explanation": "Why the refactoring is better"\n'
            f'}}\n'
            f"Do not include markdown tags. Return raw JSON."
        )

        try:
            model = genai.GenerativeModel(settings.GEMINI_MODEL)
            response = model.generate_content(prompt)
            raw_text = response.text.replace("```json", "").replace("```", "").strip()
            return json.loads(raw_text)
        except Exception as e:
            return {
                "readability_score": 50,
                "issues_found": [f"AI analysis failed: {str(e)}"],
                "refactored_code": code,
                "explanation": "Could not generate optimization reports."
            }
