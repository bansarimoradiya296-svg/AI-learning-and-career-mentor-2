// Global State Cache
let accessToken = "";
let currentUser = null;
let currentMode = "login";
let activeTab = "dashboard";
let activeWebSocket = null;
let activeInterviewSessionId = null;
let currentCodingProblem = null;
let codingProblems = [];

// API Path Root
const API_ROOT = "/api/v1";

// DOM Initializer
document.addEventListener("DOMContentLoaded", () => {
    // Check if browser has cached refresh cookie
    silentTokenRefresh();
    
    // Set default theme state
    const savedTheme = localStorage.getItem("theme") || "dark";
    document.body.setAttribute("data-theme", savedTheme);
    updateThemeIcon(savedTheme);
});

// Theme Management
function toggleTheme() {
    const currentTheme = document.body.getAttribute("data-theme");
    const nextTheme = currentTheme === "dark" ? "light" : "dark";
    document.body.setAttribute("data-theme", nextTheme);
    localStorage.setItem("theme", nextTheme);
    updateThemeIcon(nextTheme);
}

function updateThemeIcon(theme) {
    const icon = document.getElementById("theme-icon");
    if (theme === "dark") {
        icon.className = "bi bi-moon-stars-fill text-warning";
    } else {
        icon.className = "bi bi-sun-fill text-primary";
    }
}

// Silent Refresh Session Check
async function silentTokenRefresh() {
    try {
        const response = await fetch(`${API_ROOT}/auth/refresh`, {
            method: "POST",
            headers: {
                "X-Device-Id": getDeviceHash()
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            accessToken = data.access_token;
            currentUser = data.user;
            onLoginSuccess();
        } else {
            // Unauthenticated: display Auth Modal
            showAuthModal();
        }
    } catch (e) {
        showAuthModal();
    }
}

function getDeviceHash() {
    // Unique session ID generator/hash
    let hash = localStorage.getItem("device_hash");
    if (!hash) {
        hash = "device_" + Math.random().toString(36).substring(2, 15);
        localStorage.setItem("device_hash", hash);
    }
    return hash;
}

// Authentication Modals
function showAuthModal() {
    const modalElement = document.getElementById("loginModal");
    const modal = new bootstrap.Modal(modalElement);
    modal.show();
}

function toggleAuthMode() {
    const title = document.getElementById("auth-modal-title");
    const submitBtn = document.getElementById("auth-submit-btn");
    const toggleMsg = document.getElementById("auth-toggle-msg");
    const toggleLink = document.getElementById("auth-toggle-link");
    const nameFields = document.getElementById("auth-name-fields");
    const errorBlock = document.getElementById("auth-error-block");
    
    errorBlock.classList.add("d-none");

    if (currentMode === "login") {
        currentMode = "register";
        title.innerText = "Create Account";
        submitBtn.innerText = "Register";
        toggleMsg.innerText = "Already have an account?";
        toggleLink.innerText = "Sign In";
        nameFields.classList.remove("d-none");
    } else {
        currentMode = "login";
        title.innerText = "Welcome Back";
        submitBtn.innerText = "Login";
        toggleMsg.innerText = "Don't have an account?";
        toggleLink.innerText = "Register Now";
        nameFields.classList.add("d-none");
    }
}

function resetAuthError() {
    const err = document.getElementById("auth-error-block");
    err.classList.add("d-none");
    err.innerText = "";
}

// Auth Forms Handler
async function executeAuthAction(event) {
    event.preventDefault();
    const email = document.getElementById("auth-email").value;
    const password = document.getElementById("auth-password").value;
    const errorBlock = document.getElementById("auth-error-block");
    
    errorBlock.classList.add("d-none");
    
    if (currentMode === "otp") {
        const otp = document.getElementById("auth-otp").value;
        try {
            const verifyRes = await fetch(`${API_ROOT}/auth/verify-otp`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, otp_code: otp })
            });
            const data = await verifyRes.json();
            
            if (verifyRes.ok) {
                currentMode = "login";
                document.getElementById("auth-otp-field").classList.add("d-none");
                document.getElementById("auth-otp").value = "";
                // Reset to login mode visually
                const title = document.getElementById("auth-modal-title");
                const submitBtn = document.getElementById("auth-submit-btn");
                const toggleMsg = document.getElementById("auth-toggle-msg");
                const toggleLink = document.getElementById("auth-toggle-link");
                const nameFields = document.getElementById("auth-name-fields");
                
                title.innerText = "Welcome Back";
                submitBtn.innerText = "Login";
                toggleMsg.innerText = "Don't have an account?";
                toggleLink.innerText = "Register Now";
                nameFields.classList.add("d-none");
                
                errorBlock.className = "alert alert-success";
                errorBlock.innerText = "Verification complete! Sign In to begin.";
                errorBlock.classList.remove("d-none");
            } else {
                errorBlock.className = "alert alert-danger";
                errorBlock.innerText = data.message || "OTP verification failed.";
                errorBlock.classList.remove("d-none");
            }
        } catch (e) {
            errorBlock.className = "alert alert-danger";
            errorBlock.innerText = "System connection lost. Please try again.";
            errorBlock.classList.remove("d-none");
        }
        return;
    }

    let url = `${API_ROOT}/auth/login`;
    let payload = {};

    if (currentMode === "register") {
        url = `${API_ROOT}/auth/register`;
        const first_name = document.getElementById("auth-fname").value;
        const last_name = document.getElementById("auth-lname").value;
        payload = { email, password, first_name, last_name };
    } else {
        payload = { email, password, device_id: getDeviceHash() };
    }

    try {
        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        const data = await response.json();
        
        if (response.ok) {
            if (currentMode === "register") {
                // Switch to OTP verification modal
                document.getElementById("auth-otp-field").classList.remove("d-none");
                document.getElementById("auth-submit-btn").innerText = "Verify OTP";
                currentMode = "otp";
                errorBlock.className = "alert alert-warning";
                errorBlock.innerText = "Verification OTP code sent to email. Enter below.";
                errorBlock.classList.remove("d-none");
            } else {
                // Login Success
                accessToken = data.access_token;
                currentUser = data.user;
                onLoginSuccess();
                
                // Hide modal
                const modalInstance = bootstrap.Modal.getInstance(document.getElementById("loginModal"));
                modalInstance.hide();
            }
        } else {
            errorBlock.className = "alert alert-danger";
            errorBlock.innerText = data.message || "Authentication failed.";
            errorBlock.classList.remove("d-none");
        }
    } catch (e) {
        errorBlock.className = "alert alert-danger";
        errorBlock.innerText = "System connection lost. Please try again.";
        errorBlock.classList.remove("d-none");
    }
}

// Session Initialization
function onLoginSuccess() {
    document.getElementById("auth-buttons-wrapper").innerHTML = `
        <span class="badge bg-success p-2">Session Secure</span>
    `;
    
    document.getElementById("user-email-display").innerText = currentUser.email;
    const roleNames = currentUser.roles.map(r => r.name);
    document.getElementById("user-role-display").innerText = roleNames.join(", ");
    
    // Check if admin roles present
    if (roleNames.includes("Admin") || roleNames.includes("Super Admin")) {
        document.getElementById("admin-nav").classList.remove("d-none");
    }
    
    // Load initial tab data
    switchTab("dashboard");
}

async function logout() {
    await fetch(`${API_ROOT}/auth/logout`, { method: "POST" });
    accessToken = "";
    currentUser = null;
    window.location.reload();
}

// Tab Switching Routing
function switchTab(tabId) {
    activeTab = tabId;
    
    // Nav highlight
    document.querySelectorAll(".nav-link-custom").forEach(el => el.classList.remove("active"));
    event.currentTarget.classList.add("active");
    
    // Pane visibility
    document.querySelectorAll(".tab-pane-custom").forEach(el => el.classList.add("d-none"));
    document.getElementById(`tab-${tabId}`).classList.remove("d-none");
    
    // Set headers
    const title = document.getElementById("tab-title");
    const subtitle = document.getElementById("tab-subtitle");
    
    if (tabId === "dashboard") {
        title.innerText = "Student Dashboard";
        subtitle.innerText = "Track your learning statistics and readiness indicators.";
        loadDashboardMetrics();
    } else if (tabId === "study") {
        title.innerText = "AI Study Companion";
        subtitle.innerText = "Incorporate study notes, ask questions, and test your knowledge.";
        loadStudyCompanionData();
    } else if (tabId === "coding") {
        title.innerText = "AI Coding Mentor";
        subtitle.innerText = "Compile code solutions and query complexity feedbacks.";
        loadCodingProblems();
    } else if (tabId === "career") {
        title.innerText = "Career Roadmap Architect";
        subtitle.innerText = "Map learning pathways to close technical skill gaps.";
        loadCareerGoalProfile();
    } else if (tabId === "interview") {
        title.innerText = "Interview Simulator";
        subtitle.innerText = "Practice Technical and HR questions in an interactive chat session.";
        loadMockInterviewTab();
    } else if (tabId === "admin") {
        title.innerText = "Admin Management Portal";
        subtitle.innerText = "Monitor security logs and manage system users.";
        loadAdminPanelData();
    }
}

// ==========================================
// 1. Dashboard Logic
// ==========================================
async function loadDashboardMetrics() {
    if (!accessToken) return;
    try {
        const res = await fetch(`${API_ROOT}/dashboard/metrics`, {
            headers: { "Authorization": `Bearer ${accessToken}` }
        });
        if (res.ok) {
            const data = await res.json();
            document.getElementById("dash-xp").innerText = data.total_xp;
            document.getElementById("dash-readiness").innerText = `${data.job_readiness_score}%`;
            document.getElementById("dash-quizzes").innerText = data.quizzes_completed;
            document.getElementById("dash-coding").innerText = data.coding_challenges_solved;
            document.getElementById("dash-target-title").innerText = data.target_job_title;
            
            document.getElementById("dash-roadmap-progress-bar").style.width = `${data.roadmap_progress}%`;
            document.getElementById("dash-roadmap-progress-text").innerText = `${data.roadmap_progress}% Roadmap Milestones Complete`;
        }
    } catch (e) {
        console.error("Dashboard metrics failed to load", e);
    }
}

// ==========================================
// 2. Study Companion Logic
// ==========================================
async function loadStudyCompanionData() {
    if (!accessToken) return;
    try {
        // Fetch resources
        const res = await fetch(`${API_ROOT}/study/flashcards`, {
            headers: { "Authorization": `Bearer ${accessToken}` }
        });
        if (res.ok) {
            // Fill documents lists, flashcard data details
            const list = document.getElementById("processed-docs-list");
            list.innerHTML = `<span class="text-secondary small">Files processed successfully support vector lookup.</span>`;
        }
    } catch (e) {}
}

async function uploadDocument(event) {
    event.preventDefault();
    const fileInput = document.getElementById("study-file");
    const statusDiv = document.getElementById("upload-status");
    if (fileInput.files.length === 0) return;
    
    statusDiv.innerText = "Uploading and indexing document chunks (RAG)...";
    
    const formData = new FormData();
    formData.append("file", fileInput.files[0]);
    
    try {
        const res = await fetch(`${API_ROOT}/study/upload`, {
            method: "POST",
            headers: { "Authorization": `Bearer ${accessToken}` },
            body: formData
        });
        
        if (res.ok) {
            statusDiv.innerText = "Upload complete! Documents fully indexed.";
            fileInput.value = "";
            loadStudyCompanionData();
        } else {
            statusDiv.innerText = "Indexing error. Please try again.";
        }
    } catch (e) {
        statusDiv.innerText = "Connection error. Ingestion failed.";
    }
}

async function askRAG(event) {
    event.preventDefault();
    const queryInput = document.getElementById("rag-query");
    const chatPane = document.getElementById("rag-chat-history");
    const query = queryInput.value.trim();
    if (!query) return;

    // Append student query
    chatPane.innerHTML += `<div class="mb-2 text-white"><strong>You:</strong> ${query}</div>`;
    queryInput.value = "";
    chatPane.scrollTop = chatPane.scrollHeight;

    try {
        const res = await fetch(`${API_ROOT}/study/ask?query=${encodeURIComponent(query)}`, {
            method: "POST",
            headers: { "Authorization": `Bearer ${accessToken}` }
        });
        
        if (res.ok) {
            const data = await res.json();
            chatPane.innerHTML += `<div class="mb-3 text-info"><strong>AI Mentor:</strong> ${data.answer}</div>`;
        } else {
            chatPane.innerHTML += `<div class="mb-3 text-danger">Error fetching AI answer.</div>`;
        }
        chatPane.scrollTop = chatPane.scrollHeight;
    } catch (e) {
        chatPane.innerHTML += `<div class="mb-3 text-danger">Lost connection.</div>`;
    }
}

// Spaced repetition flashcards reviews
function triggerFlashcardReview() {
    alert("SuperMemo SM-2 deck review session loading. Ingest notes to auto-generate cards.");
}

// AI Quiz Maker
function triggerQuizGen() {
    alert("AI Quiz generation requires study companion PDFs ingested. Try uploading files first.");
}

// ==========================================
// 3. Coding Mentor Logic
// ==========================================
async function loadCodingProblems() {
    if (!accessToken) return;
    try {
        const res = await fetch(`${API_ROOT}/coding/problems`, {
            headers: { "Authorization": `Bearer ${accessToken}` }
        });
        if (res.ok) {
            codingProblems = await res.json();
            const list = document.getElementById("coding-problems-list");
            list.innerHTML = "";
            
            codingProblems.forEach(prob => {
                const btn = document.createElement("button");
                btn.className = "list-group-item list-group-item-action bg-transparent border-0 text-white py-2";
                btn.innerHTML = `<i class="bi bi-file-code-fill text-primary me-2"></i> ${prob.title}`;
                btn.onclick = () => selectCodingProblem(prob);
                list.appendChild(btn);
            });
            
            if (codingProblems.length > 0) {
                selectCodingProblem(codingProblems[0]);
            }
        }
    } catch (e) {}
}

function selectCodingProblem(problem) {
    currentCodingProblem = problem;
    document.getElementById("active-problem-title").innerText = problem.title;
    document.getElementById("coding-problem-text").innerText = problem.description_markdown;
    loadStarterCode();
}

function loadStarterCode() {
    if (!currentCodingProblem) return;
    const lang = document.getElementById("code-language").value;
    const code = currentCodingProblem.starter_code[lang] || "";
    document.getElementById("code-editor-box").value = code;
}

async function submitCodeSolution() {
    if (!currentCodingProblem || !accessToken) return;
    
    const code = document.getElementById("code-editor-box").value;
    const lang = document.getElementById("code-language").value;
    const consoleBox = document.getElementById("coding-output-console");
    
    consoleBox.innerText = "Compiling and evaluating solution test cases...";
    
    try {
        const res = await fetch(`${API_ROOT}/coding/problems/${currentCodingProblem.id}/submit`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${accessToken}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ code_content: code, language: lang })
        });
        
        if (res.ok) {
            const data = await res.json();
            let summary = `STATUS: ${data.status}\nSimulated Runtime: ${data.execution_time}s\n`;
            
            if (data.validation_results.test_cases) {
                data.validation_results.test_cases.forEach(tc => {
                    summary += `Test case ${tc.test_case || ""}: Passed = ${tc.passed} (Expected: ${tc.expected}, Actual: ${tc.actual})\n`;
                });
            }
            if (data.validation_results.suggestions) {
                summary += `\nAI Optimization Tips:\n${data.validation_results.suggestions}`;
            }
            consoleBox.innerText = summary;
        } else {
            consoleBox.innerText = "Compilation/Runtime check failed.";
        }
    } catch (e) {
        consoleBox.innerText = "Lost connection to compiler.";
    }
}

async function requestOptimization() {
    if (!accessToken) return;
    const code = document.getElementById("code-editor-box").value;
    const lang = document.getElementById("code-language").value;
    const consoleBox = document.getElementById("coding-output-console");
    
    consoleBox.innerText = "Analyzing code architecture complexity metrics...";
    
    try {
        const res = await fetch(`${API_ROOT}/coding/optimize?language=${lang}`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${accessToken}`,
                "Content-Type": "text/plain"
            },
            body: code
        });
        
        if (res.ok) {
            const data = await res.json();
            let summary = `Readability Score: ${data.readability_score}/100\nIssues Identified:\n`;
            data.issues_found.forEach(issue => {
                summary += `- ${issue}\n`;
            });
            summary += `\nRefactored Suggestion:\n${data.refactored_code}\n\nExplanation:\n${data.explanation}`;
            consoleBox.innerText = summary;
        }
    } catch (e) {}
}

// ==========================================
// 4. Career Roadmap Logic
// ==========================================
async function uploadResume(event) {
    event.preventDefault();
    const title = document.getElementById("target-job").value;
    const fileInput = document.getElementById("resume-file");
    if (fileInput.files.length === 0) return;

    const formData = new FormData();
    formData.append("target_job_title", title);
    formData.append("file", fileInput.files[0]);

    const timeline = document.getElementById("timeline-wrapper");
    timeline.innerHTML = `<div class="spinner-border text-primary" role="status"></div><p>AI Recruiter is parsing resume and plotting learning roadmaps...</p>`;

    try {
        const res = await fetch(`${API_ROOT}/career/analyze`, {
            method: "POST",
            headers: { "Authorization": `Bearer ${accessToken}` },
            body: formData
        });

        if (res.ok) {
            loadCareerGoalProfile();
        } else {
            timeline.innerHTML = `<p class="text-danger">Failed to parse resume.</p>`;
        }
    } catch (e) {
        timeline.innerHTML = `<p class="text-danger">Ingestion timeout.</p>`;
    }
}

async function loadCareerGoalProfile() {
    if (!accessToken) return;
    try {
        const res = await fetch(`${API_ROOT}/career/goals`, {
            headers: { "Authorization": `Bearer ${accessToken}` }
        });
        if (res.ok) {
            const goals = await res.json();
            if (goals.length > 0) {
                const latest = goals[0];
                
                // Draw Skills map
                const map = document.getElementById("skill-gap-panel");
                map.innerHTML = `
                    <h5>Targeting: <span class="text-info">${latest.target_job_title}</span></h5>
                    <p class="text-secondary small">Acquired Skills: ${latest.current_skills.join(", ")}</p>
                    <p class="text-warning small">Target Gaps: ${latest.target_skills.join(", ")}</p>
                `;

                // Draw Timeline track
                if (latest.roadmaps.length > 0) {
                    const roadmap = latest.roadmaps[0];
                    const timeline = document.getElementById("timeline-wrapper");
                    timeline.innerHTML = "";
                    
                    roadmap.structure.phases.forEach(phase => {
                        const div = document.createElement("div");
                        div.className = "timeline-item";
                        div.innerHTML = `
                            <h5 class="fw-bold">${phase.title} <span class="badge bg-primary text-white ms-2">${phase.estimated_weeks} Weeks</span></h5>
                            <ul class="text-secondary small">
                                ${phase.milestones.map(m => `<li>${m}</li>`).join("")}
                            </ul>
                        `;
                        timeline.appendChild(div);
                    });
                }
            }
        }
    } catch (e) {}
}

// ==========================================
// 5. Mock Interview WebSocket Logic
// ==========================================
async function loadMockInterviewTab() {
    if (!accessToken) return;
    try {
        const res = await fetch(`${API_ROOT}/interview/sessions`, {
            headers: { "Authorization": `Bearer ${accessToken}` }
        });
        if (res.ok) {
            const sessions = await res.json();
            const list = document.getElementById("mock-sessions-list");
            list.innerHTML = "";
            
            sessions.forEach(sess => {
                const item = document.createElement("div");
                item.className = "list-group-item bg-transparent text-white border-0 border-bottom border-secondary border-opacity-10 py-3";
                
                let scoreText = "";
                if (sess.report) {
                    scoreText = `<span class="badge bg-success float-end">Score: ${sess.report.overall_score}%</span>`;
                }
                
                item.innerHTML = `
                    <div class="fw-bold">${sess.type} Mock ${scoreText}</div>
                    <small class="text-secondary">Started: ${new Date(sess.started_at).toLocaleDateString()}</small>
                `;
                list.appendChild(item);
            });
        }
    } catch (e) {}
}

async function initiateMockInterview() {
    if (!accessToken) return;
    const type = document.getElementById("interview-type").value;
    const chatPane = document.getElementById("interview-chat-pane");
    
    chatPane.innerHTML = `<p class="text-secondary">Connecting to live mock interviewer websocket...</p>`;
    
    try {
        const res = await fetch(`${API_ROOT}/interview/sessions`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${accessToken}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ type })
        });
        
        if (res.ok) {
            const data = await res.json();
            activeInterviewSessionId = data.id;
            
            // Connect WebSocket
            const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
            const wsUrl = `${wsProtocol}//${window.location.host}${API_ROOT}/interview/ws/${data.id}?token=${accessToken}`;
            
            activeWebSocket = new WebSocket(wsUrl);
            
            activeWebSocket.onopen = () => {
                chatPane.innerHTML = `<p class="text-success small">Interviewer online. Interview started.</p>`;
                // Enable inputs
                document.getElementById("interview-user-message").removeAttribute("disabled");
                document.getElementById("interview-send-btn").removeAttribute("disabled");
                document.getElementById("interview-end-btn").removeAttribute("disabled");
            };
            
            activeWebSocket.onmessage = (event) => {
                const msg = JSON.parse(event.data);
                if (msg.sender === "REPORT") {
                    // Display report output
                    chatPane.innerHTML += `
                        <div class="alert alert-success mt-3">
                            <h5>Interview Evaluation Summary</h5>
                            <p><strong>Overall Score:</strong> ${msg.report.overall_score}%</p>
                            <p><strong>Technical Score:</strong> ${msg.report.technical_score}%</p>
                            <p><strong>Communication:</strong> ${msg.report.communication_score}%</p>
                            <p><strong>Confidence:</strong> ${msg.report.confidence_score}%</p>
                            <p><strong>Strengths:</strong> ${msg.report.evaluation_summary.strengths.join(", ")}</p>
                            <p><strong>Improvements:</strong> ${msg.report.evaluation_summary.suggestions.join(", ")}</p>
                        </div>
                    `;
                    disableInterviewInputs();
                } else if (msg.sender === "INTERVIEWER") {
                    chatPane.innerHTML += `
                        <div class="mb-3 text-info">
                            <strong>Interviewer:</strong> ${msg.text}
                        </div>
                    `;
                } else if (msg.sender === "STUDENT") {
                    chatPane.innerHTML += `
                        <div class="mb-2 text-white">
                            <strong>You:</strong> ${msg.text}
                        </div>
                    `;
                } else {
                    chatPane.innerHTML += `<div class="mb-2 text-secondary small">${msg.text}</div>`;
                }
                chatPane.scrollTop = chatPane.scrollHeight;
            };
            
            activeWebSocket.onclose = () => {
                console.log("WebSocket closed");
            };
        }
    } catch (e) {
        chatPane.innerHTML = `<p class="text-danger">WebSocket initialization failed.</p>`;
    }
}

function sendInterviewResponse() {
    const input = document.getElementById("interview-user-message");
    const text = input.value.trim();
    if (!text || !activeWebSocket) return;
    
    activeWebSocket.send(text);
    input.value = "";
}

function endInterviewSession() {
    if (activeWebSocket) {
        activeWebSocket.send("/end");
    }
}

function disableInterviewInputs() {
    document.getElementById("interview-user-message").setAttribute("disabled", "true");
    document.getElementById("interview-send-btn").setAttribute("disabled", "true");
    document.getElementById("interview-end-btn").setAttribute("disabled", "true");
    activeWebSocket = null;
    activeInterviewSessionId = null;
    loadMockInterviewTab();
}

// ==========================================
// 6. Admin Panel Logic
// ==========================================
async function loadAdminPanelData() {
    if (!accessToken) return;
    try {
        const metricsRes = await fetch(`${API_ROOT}/admin/metrics`, {
            headers: { "Authorization": `Bearer ${accessToken}` }
        });
        if (metricsRes.ok) {
            const data = await metricsRes.json();
            document.getElementById("admin-stat-users").innerText = data.total_registered_users;
            document.getElementById("admin-stat-logins").innerText = data.total_system_logins_recorded;
        }

        const logsRes = await fetch(`${API_ROOT}/admin/logs`, {
            headers: { "Authorization": `Bearer ${accessToken}` }
        });
        if (logsRes.ok) {
            const logs = await logsRes.json();
            const tbody = document.getElementById("admin-logs-table-body");
            tbody.innerHTML = "";
            
            logs.forEach(log => {
                const tr = document.createElement("tr");
                tr.innerHTML = `
                    <td>${new Date(log.timestamp).toLocaleString()}</td>
                    <td><span class="badge bg-secondary">${log.action}</span></td>
                    <td>${log.entity}</td>
                    <td>${log.ip_address || "unknown"}</td>
                    <td>${log.new_value || "Status success"}</td>
                `;
                tbody.appendChild(tr);
            });
        }
    } catch (e) {}
}
