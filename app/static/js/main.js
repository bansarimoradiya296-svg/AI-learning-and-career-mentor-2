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
        const activeSub = localStorage.getItem("active_coding_sub_tab") || "chat";
        switchCodingSubTab(activeSub);
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


// ============================================================================
// Coding Mentor Sub-tab Switching and Feature System
// ============================================================================

function switchCodingSubTab(subTabId) {
    // Save selection in cache
    localStorage.setItem("active_coding_sub_tab", subTabId);
    
    // Toggle active class on all sub-tab buttons
    document.querySelectorAll(".btn-sub-tab").forEach(btn => btn.classList.remove("active"));
    const activeBtn = document.getElementById(`btn-sub-${subTabId}`);
    if (activeBtn) activeBtn.classList.add("active");
    
    // Toggle active style on workflow cards for visual feedback
    document.querySelectorAll(".feature-card").forEach(card => {
        card.style.transform = "";
        card.style.boxShadow = "";
    });
    const activeCard = document.querySelector(`.card-${subTabId === 'chat' ? 'chat' : subTabId === 'debugger' ? 'debugger' : subTabId === 'explain' ? 'explain' : 'quiz'}`);
    if (activeCard) {
        activeCard.style.transform = "translateY(-4px)";
        if (subTabId === 'chat') {
            activeCard.style.boxShadow = "0 8px 30px rgba(59, 130, 246, 0.25)";
        } else if (subTabId === 'debugger') {
            activeCard.style.boxShadow = "0 8px 30px rgba(16, 185, 129, 0.25)";
        } else if (subTabId === 'explain') {
            activeCard.style.boxShadow = "0 8px 30px rgba(245, 158, 11, 0.25)";
        } else if (subTabId === 'quiz') {
            activeCard.style.boxShadow = "0 8px 30px rgba(139, 92, 246, 0.25)";
        }
    }
    
    // Toggle visibility of sub-pane divs
    document.querySelectorAll(".coding-sub-pane").forEach(pane => pane.classList.add("d-none"));
    const activePane = document.getElementById(`coding-sub-${subTabId}`);
    if (activePane) activePane.classList.remove("d-none");
    
    // Update main header title & subtitle
    const title = document.getElementById("tab-title");
    const subtitle = document.getElementById("tab-subtitle");
    
    if (subTabId === "chat") {
        title.innerText = "AI Chat Assistant";
        subtitle.innerText = "Ask anything about coding. Get instant AI-powered answers.";
        initCodingChat();
    } else if (subTabId === "debugger") {
        title.innerText = "AI Error Debugger";
        subtitle.innerText = "Paste your error or code. Get AI-powered debugging help.";
    } else if (subTabId === "explain") {
        title.innerText = "Explain Code";
        subtitle.innerText = "Get a detailed explanation of any code.";
    } else if (subTabId === "quiz") {
        title.innerText = "Coding Quiz";
        subtitle.innerText = "Test your coding knowledge with AI-generated quizzes.";
    }
}

function clearActiveCodingChat() {
    if (!activeCodingChatId) return;
    const session = codingChatSessions.find(s => s.id === activeCodingChatId);
    if (session) {
        session.messages = [];
        localStorage.setItem("coding_chat_sessions", JSON.stringify(codingChatSessions));
        selectCodingChatSession(activeCodingChatId);
    }
}


// 1. AI Chat Assistant Logic
let codingChatSessions = [];
let activeCodingChatId = null;

function initCodingChat() {
    const cached = localStorage.getItem("coding_chat_sessions");
    if (cached) {
        codingChatSessions = JSON.parse(cached);
    } else {
        // Seed default chats matching screenshot
        codingChatSessions = [
            {
                id: "chat-1",
                title: "Explain recursion in Python",
                timestamp: "10:30 AM",
                messages: [
                    { role: "user", parts: ["Explain recursion in Python"] },
                    { role: "model", parts: ["**Recursion** is a programming technique where a function calls itself to solve a smaller instance of the same problem.\n\nEvery recursive function must have two main components:\n1. **Base Case:** The condition under which the function stops calling itself and returns a value.\n2. **Recursive Case:** The part of the function where it calls itself with a modified argument, moving closer to the base case.\n\n**Example (Factorial in Python):**\n```python\ndef factorial(n):\n    # Base case\n    if n == 0:\n        return 1\n    # Recursive case\n    else:\n        return n * factorial(n - 1)\n```"] }
                ]
            },
            {
                id: "chat-2",
                title: "Why is my code not working?",
                timestamp: "Yesterday",
                messages: [
                    { role: "user", parts: ["Why am I getting 'NoneType' object has no attribute 'append'?"] },
                    { role: "model", parts: ["This error occurs because you're trying to call the `append()` method on a variable that is `None`.\n\n**Reason:**\nThe variable is `None`, which means it doesn't point to a list (or any object that has `append()`).\n\n**How to Fix:**\n- Initialize the variable with an empty list `[]` before using `append()`;\n- Check your code to ensure the variable is assigned a list.\n\n**Example:**\n```python\n# Wrong\nmy_list = None\nmy_list.append(1)  # Error\n\n# Correct\nmy_list = []\nmy_list.append(1)  # Works\n```"] }
                ]
            },
            {
                id: "chat-3",
                title: "What is middleware in Express?",
                timestamp: "2 days ago",
                messages: []
            },
            {
                id: "chat-4",
                title: "Explain SQL JOIN",
                timestamp: "3 days ago",
                messages: []
            },
            {
                id: "chat-5",
                title: "Time complexity of binary search",
                timestamp: "3 days ago",
                messages: []
            }
        ];
        localStorage.setItem("coding_chat_sessions", JSON.stringify(codingChatSessions));
    }
    
    loadCodingChatSessions();
    if (codingChatSessions.length > 0 && !activeCodingChatId) {
        selectCodingChatSession(codingChatSessions[0].id);
    }
}

function startNewCodingChat() {
    const newId = "chat-" + Date.now();
    const newChat = {
        id: newId,
        title: "New Chat",
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        messages: []
    };
    codingChatSessions.unshift(newChat);
    localStorage.setItem("coding_chat_sessions", JSON.stringify(codingChatSessions));
    loadCodingChatSessions();
    selectCodingChatSession(newId);
}

function loadCodingChatSessions() {
    const list = document.getElementById("recent-chats-list");
    if (!list) return;
    list.innerHTML = "";
    
    codingChatSessions.forEach(session => {
        const btn = document.createElement("a");
        btn.href = "#";
        btn.className = `list-group-item list-group-item-action bg-transparent border-0 text-white py-3 px-2 rounded mb-2 ${session.id === activeCodingChatId ? 'active-chat-item' : ''}`;
        btn.style.transition = "all 0.2s ease";
        btn.style.borderRadius = "8px";
        if (session.id === activeCodingChatId) {
            btn.style.background = "rgba(99, 102, 241, 0.15)";
            btn.style.borderLeft = "3px solid var(--primary)";
        }
        
        btn.innerHTML = `
            <div class="d-flex justify-content-between align-items-center">
                <span class="fw-medium text-truncate text-white" style="max-width: 70%;">
                    <i class="bi bi-chat-left-text text-primary me-2"></i>${session.title}
                </span>
                <span class="text-secondary small" style="font-size: 0.75rem;">${session.timestamp}</span>
            </div>
        `;
        btn.onclick = (e) => {
            e.preventDefault();
            selectCodingChatSession(session.id);
        };
        list.appendChild(btn);
    });
}

function selectCodingChatSession(sessionId) {
    activeCodingChatId = sessionId;
    loadCodingChatSessions();
    
    const container = document.getElementById("chat-messages-container");
    if (!container) return;
    container.innerHTML = "";
    
    const session = codingChatSessions.find(s => s.id === sessionId);
    if (!session || session.messages.length === 0) {
        container.innerHTML = `
            <div class="text-secondary text-center py-5">
                <i class="bi bi-chat-left-text-fill fs-1 mb-2 text-primary opacity-50"></i>
                <p>Type a question below to start chatting with your AI Coding Mentor.</p>
            </div>
        `;
        return;
    }
    
    session.messages.forEach(msg => {
        const bubble = document.createElement("div");
        if (msg.role === "user") {
            bubble.className = "chat-bubble-user";
            bubble.innerHTML = `<div>${escapeHtml(msg.parts[0])}</div>`;
        } else {
            bubble.className = "chat-bubble-mentor";
            bubble.innerHTML = `
                <div class="d-flex align-items-center mb-2">
                    <i class="bi bi-cpu-fill text-primary me-2"></i>
                    <strong class="text-info">AI Mentor</strong>
                </div>
                <div>${formatMarkdown(msg.parts[0])}</div>
            `;
        }
        container.appendChild(bubble);
    });
    container.scrollTop = container.scrollHeight;
}

async function sendCodingChatMessage(event) {
    event.preventDefault();
    const input = document.getElementById("coding-chat-input");
    const query = input.value.trim();
    if (!query || !activeCodingChatId) return;
    
    input.value = "";
    
    const session = codingChatSessions.find(s => s.id === activeCodingChatId);
    if (!session) return;
    
    if (session.title === "New Chat") {
        session.title = query.length > 25 ? query.substring(0, 25) + "..." : query;
    }
    
    session.messages.push({ role: "user", parts: [query] });
    localStorage.setItem("coding_chat_sessions", JSON.stringify(codingChatSessions));
    selectCodingChatSession(activeCodingChatId);
    
    const container = document.getElementById("chat-messages-container");
    const typing = document.createElement("div");
    typing.className = "chat-bubble-mentor text-secondary";
    typing.innerHTML = `
        <div class="d-flex align-items-center">
            <div class="spinner-border spinner-border-sm text-primary me-2" role="status"></div>
            <strong>AI Mentor is typing...</strong>
        </div>
    `;
    container.appendChild(typing);
    container.scrollTop = container.scrollHeight;
    
    try {
        const res = await fetch(`${API_ROOT}/coding/chat`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${accessToken}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                message: query,
                history: session.messages.slice(0, -1)
            })
        });
        
        typing.remove();
        
        if (res.ok) {
            const data = await res.json();
            session.messages.push({ role: "model", parts: [data.response] });
            localStorage.setItem("coding_chat_sessions", JSON.stringify(codingChatSessions));
            selectCodingChatSession(activeCodingChatId);
        } else {
            const errBubble = document.createElement("div");
            errBubble.className = "chat-bubble-mentor text-danger";
            errBubble.innerText = "Error getting response from AI Assistant.";
            container.appendChild(errBubble);
        }
    } catch (e) {
        typing.remove();
        const errBubble = document.createElement("div");
        errBubble.className = "chat-bubble-mentor text-danger";
        errBubble.innerText = "System connection lost.";
        container.appendChild(errBubble);
    }
}

// 2. AI Error Debugger Logic
async function analyzeError() {
    const input = document.getElementById("debugger-input").value.trim();
    if (!input) return;
    
    const placeholder = document.getElementById("debugger-placeholder");
    const container = document.getElementById("debugger-details-container");
    
    placeholder.innerHTML = `
        <div class="spinner-border text-danger" role="status"></div>
        <p class="mt-2">AI is debugging your code block...</p>
    `;
    placeholder.classList.remove("d-none");
    container.classList.add("d-none");
    
    try {
        const res = await fetch(`${API_ROOT}/coding/debug`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${accessToken}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ code_or_error: input })
        });
        
        if (res.ok) {
            const data = await res.json();
            placeholder.classList.add("d-none");
            container.classList.remove("d-none");
            
            document.getElementById("debug-error-type").innerText = data.error_type || "Error";
            document.getElementById("debug-reason").innerText = data.reason || "-";
            document.getElementById("debug-fix").innerText = data.how_to_fix || "-";
            document.getElementById("debug-code-box").innerText = data.correct_code || "-";
            document.getElementById("debug-best-practice").innerText = data.best_practice || "-";
        } else {
            placeholder.innerHTML = `<p class="text-danger">Failed to debug code.</p>`;
        }
    } catch (e) {
        placeholder.innerHTML = `<p class="text-danger">Connection error.</p>`;
    }
}

// 3. Explain Code Logic
async function explainCode() {
    const code = document.getElementById("explain-input").value.trim();
    const lang = document.getElementById("explain-language").value;
    if (!code) return;
    
    const placeholder = document.getElementById("explain-placeholder");
    const container = document.getElementById("explain-details-container");
    
    placeholder.innerHTML = `
        <div class="spinner-border text-info" role="status"></div>
        <p class="mt-2">AI is explaining the logic...</p>
    `;
    placeholder.classList.remove("d-none");
    container.classList.add("d-none");
    
    try {
        const res = await fetch(`${API_ROOT}/coding/explain`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${accessToken}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ code: code, language: lang })
        });
        
        if (res.ok) {
            const data = await res.json();
            placeholder.classList.add("d-none");
            container.classList.remove("d-none");
            
            document.getElementById("explain-purpose").innerText = data.purpose || "-";
            document.getElementById("explain-steps").innerHTML = formatBulletList(data.explanation || "-");
            document.getElementById("explain-output-box").innerText = data.output || "-";
        } else {
            placeholder.innerHTML = `<p class="text-danger">Failed to explain code.</p>`;
        }
    } catch (e) {
        placeholder.innerHTML = `<p class="text-danger">Connection error.</p>`;
    }
}

// 4. Code Converter Logic
async function convertCode() {
    const code = document.getElementById("converter-input").value.trim();
    const from_lang = document.getElementById("converter-from-lang").value;
    const to_lang = document.getElementById("converter-to-lang").value;
    if (!code) return;
    
    const outputBox = document.getElementById("converter-output-box");
    const outputTitle = document.getElementById("converter-output-title");
    
    outputTitle.innerText = `Converted Code (${capitalizeFirstLetter(to_lang)})`;
    outputBox.value = "// Translating syntax to target language...";
    
    try {
        const res = await fetch(`${API_ROOT}/coding/convert`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${accessToken}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                code: code,
                from_language: from_lang,
                to_language: to_lang
            })
        });
        
        if (res.ok) {
            const data = await res.json();
            outputBox.value = data.converted_code || "";
        } else {
            outputBox.value = "// Syntax conversion failed.";
        }
    } catch (e) {
        outputBox.value = "// Connection error.";
    }
}

function copyConvertedCode() {
    const outputBox = document.getElementById("converter-output-box");
    outputBox.select();
    document.execCommand("copy");
    alert("Converted code copied to clipboard!");
}

// 5. Coding Quiz Logic
let quizQuestions = [];
let currentQuizQuestionIdx = 0;
let quizScore = 0;
let quizTimeRemaining = 300;
let quizTimerInterval = null;
let selectedOptionIdx = null;

async function startCodingQuiz() {
    const topic = document.getElementById("quiz-topic").value;
    const difficulty = document.getElementById("quiz-difficulty").value;
    const qty = parseInt(document.getElementById("quiz-qty").value);
    
    const placeholder = document.getElementById("quiz-placeholder-pane");
    const activePane = document.getElementById("quiz-active-pane");
    const resultPane = document.getElementById("quiz-result-pane");
    
    resultPane.classList.add("d-none");
    activePane.classList.add("d-none");
    placeholder.innerHTML = `
        <div class="spinner-border text-success" role="status"></div>
        <p class="mt-2">AI is preparing your coding quiz questions...</p>
    `;
    placeholder.classList.remove("d-none");
    
    try {
        const res = await fetch(`${API_ROOT}/coding/quiz/generate`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${accessToken}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                topic: topic,
                difficulty: difficulty,
                num_questions: qty
            })
        });
        
        if (res.ok) {
            const data = await res.json();
            quizQuestions = data.questions || [];
            
            if (quizQuestions.length === 0) {
                placeholder.innerHTML = `<p class="text-danger">Failed to generate quiz questions.</p>`;
                return;
            }
            
            currentQuizQuestionIdx = 0;
            quizScore = 0;
            placeholder.classList.add("d-none");
            activePane.classList.remove("d-none");
            
            quizTimeRemaining = qty * 60;
            updateQuizTimerDisplay();
            clearInterval(quizTimerInterval);
            quizTimerInterval = setInterval(() => {
                quizTimeRemaining--;
                updateQuizTimerDisplay();
                if (quizTimeRemaining <= 0) {
                    endQuizSession();
                }
            }, 1000);
            
            renderQuizQuestion();
        } else {
            placeholder.innerHTML = `<p class="text-danger">Failed to connect to Quiz Generator.</p>`;
        }
    } catch (e) {
        placeholder.innerHTML = `<p class="text-danger">System offline.</p>`;
    }
}

function updateQuizTimerDisplay() {
    const minutes = Math.floor(quizTimeRemaining / 60).toString().padStart(2, '0');
    const seconds = (quizTimeRemaining % 60).toString().padStart(2, '0');
    document.getElementById("quiz-timer").innerText = `${minutes}:${seconds}`;
}

function renderQuizQuestion() {
    selectedOptionIdx = null;
    const feedback = document.getElementById("quiz-feedback-box");
    feedback.classList.add("d-none");
    
    const question = quizQuestions[currentQuizQuestionIdx];
    document.getElementById("quiz-question-number").innerText = `Question ${currentQuizQuestionIdx + 1} of ${quizQuestions.length}`;
    document.getElementById("quiz-question-text").innerHTML = formatMarkdown(question.question_text);
    
    const container = document.getElementById("quiz-options-container");
    container.innerHTML = "";
    
    question.options.forEach((opt, idx) => {
        const card = document.createElement("div");
        card.className = "quiz-option-card";
        card.id = `quiz-opt-${idx}`;
        card.innerText = opt;
        card.onclick = () => selectQuizOption(idx);
        container.appendChild(card);
    });
    
    const nextBtn = document.getElementById("quiz-next-btn");
    if (currentQuizQuestionIdx === quizQuestions.length - 1) {
        nextBtn.innerHTML = `Finish Quiz <i class="bi bi-check-lg ms-1"></i>`;
    } else {
        nextBtn.innerHTML = `Next Question <i class="bi bi-arrow-right-short ms-1"></i>`;
    }
}

function selectQuizOption(optionIdx) {
    selectedOptionIdx = optionIdx;
    document.querySelectorAll(".quiz-option-card").forEach(card => card.classList.remove("selected"));
    const selectedCard = document.getElementById(`quiz-opt-${optionIdx}`);
    if (selectedCard) selectedCard.classList.add("selected");
}

function nextCodingQuizQuestion() {
    if (selectedOptionIdx === null) {
        const feedback = document.getElementById("quiz-feedback-box");
        feedback.classList.remove("d-none");
        return;
    }
    
    const currentQ = quizQuestions[currentQuizQuestionIdx];
    const letterMap = ["A", "B", "C", "D"];
    const chosenLetter = letterMap[selectedOptionIdx] || "";
    
    if (chosenLetter === currentQ.correct_option.trim()) {
        quizScore++;
    }
    
    if (currentQuizQuestionIdx < quizQuestions.length - 1) {
        currentQuizQuestionIdx++;
        renderQuizQuestion();
    } else {
        endQuizSession();
    }
}

function endQuizSession() {
    clearInterval(quizTimerInterval);
    document.getElementById("quiz-active-pane").classList.add("d-none");
    
    const resultPane = document.getElementById("quiz-result-pane");
    resultPane.classList.remove("d-none");
    
    document.getElementById("quiz-final-score").innerText = `${quizScore} / ${quizQuestions.length}`;
}

function resetQuizWorkspace() {
    clearInterval(quizTimerInterval);
    document.getElementById("quiz-result-pane").classList.add("d-none");
    document.getElementById("quiz-active-pane").classList.add("d-none");
    document.getElementById("quiz-placeholder-pane").classList.remove("d-none");
    document.getElementById("quiz-placeholder-pane").innerHTML = `
        <i class="bi bi-question-diamond-fill fs-1 mb-2 text-success opacity-50"></i>
        <p>Configure and launch the quiz on the left panel to test your skills.</p>
    `;
}

// 6. Coding Roadmap Logic
async function generateCodingRoadmap() {
    const goal = document.getElementById("roadmap-goal-selector").value;
    
    const placeholder = document.getElementById("roadmap-placeholder-pane");
    const container = document.getElementById("roadmap-timeline-container");
    
    container.classList.add("d-none");
    placeholder.innerHTML = `
        <div class="spinner-border text-primary" role="status"></div>
        <p class="mt-2">AI is plotting your personalized roadmap phases...</p>
    `;
    placeholder.classList.remove("d-none");
    
    try {
        const res = await fetch(`${API_ROOT}/coding/roadmap/generate`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${accessToken}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ goal: goal })
        });
        
        if (res.ok) {
            const data = await res.json();
            const phases = data.phases || [];
            
            if (phases.length === 0) {
                placeholder.innerHTML = `<p class="text-danger">Failed to map roadmap steps.</p>`;
                return;
            }
            
            placeholder.classList.add("d-none");
            container.innerHTML = "";
            container.classList.remove("d-none");
            
            phases.forEach(phase => {
                const item = document.createElement("div");
                item.className = "timeline-item";
                
                let badgeClass = "badge-pending";
                if (phase.status === "Completed") badgeClass = "badge-completed";
                if (phase.status === "In Progress") badgeClass = "badge-in-progress";
                
                item.innerHTML = `
                    <div class="d-flex justify-content-between align-items-center mb-1">
                        <h5 class="fw-bold m-0 text-white">${phase.title}</h5>
                        <span class="badge ${badgeClass}">${phase.status}</span>
                    </div>
                    <p class="text-secondary small m-0">${phase.description}</p>
                `;
                container.appendChild(item);
            });
        } else {
            placeholder.innerHTML = `<p class="text-danger">API returned an error mapping roadmaps.</p>`;
        }
    } catch (e) {
        placeholder.innerHTML = `<p class="text-danger">Connection timeout.</p>`;
    }
}

// Utility formatting helpers
function escapeHtml(text) {
    if (!text) return "";
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function formatMarkdown(text) {
    if (!text) return "";
    
    let formatted = text
        .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
        .replace(/\*(.*?)\*/g, "<em>$1</em>")
        .replace(/`(.*?)`/g, "<code>$1</code>");
        
    const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
    formatted = formatted.replace(codeBlockRegex, (match, lang, code) => {
        return `<pre class="editor-textarea p-3" style="background: #090d16; font-family: 'Fira Code', monospace; margin: 12px 0; max-height: 250px; overflow-y: auto;">${escapeHtml(code.trim())}</pre>`;
    });
    
    return formatted.replace(/\n/g, "<br>");
}

function formatBulletList(text) {
    if (!text) return "";
    const lines = text.split("\n");
    let html = '<ul class="ps-3 mb-0">';
    lines.forEach(line => {
        const clean = line.replace(/^-\s*/, "").replace(/^\*\s*/, "").trim();
        if (clean) {
            html += `<li class="mb-2">${formatMarkdown(clean)}</li>`;
        }
    });
    html += '</ul>';
    return html;
}

function capitalizeFirstLetter(string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
}

// ============================================================================
// Code Evolution Timeline — Initialization & Dummy Data
// ============================================================================

function initCodeEvolutionTimeline() {
    const versions = [
        {
            version: 7, label: "(Latest)", date: "27 May 2025", time: "11:20 AM",
            desc: "Optimized binary search and handled edge cases.",
            added: 6, removed: 2, bugFixed: true, complexity: "O(log n) → O(log n)",
            tags: ["added", "removed", "bugfix"]
        },
        {
            version: 6, date: "27 May 2025", time: "09:40 AM",
            desc: "Fixed infinite loop issue.",
            added: 3, removed: 1, bugFixed: true, complexity: "O(n) → O(log n)",
            tags: ["added", "removed", "bugfix"]
        },
        {
            version: 5, date: "26 May 2025", time: "08:30 PM",
            desc: "Refactored condition check.",
            added: 4, removed: 3, bugFixed: false, complexity: "O(n) → O(n)",
            tags: ["added", "removed", "improvement"]
        },
        {
            version: 4, date: "26 May 2025", time: "06:15 PM",
            desc: "Handled empty array cases.",
            added: 2, removed: 0, bugFixed: false, complexity: "O(n) → O(n)",
            tags: ["added", "improvement"]
        }
    ];

    const container = document.getElementById("evolution-timeline-container");
    if (!container) return;
    container.innerHTML = "";

    versions.forEach((v, i) => {
        const tagHtml = v.tags.map(t => {
            if (t === "added") return `<span class="badge me-1" style="background:rgba(16,185,129,0.15);color:#34d399;font-size:0.7rem;">+ Added ${v.added} lines</span>`;
            if (t === "removed") return `<span class="badge me-1" style="background:rgba(239,68,68,0.15);color:#f87171;font-size:0.7rem;">- Removed ${v.removed} lines</span>`;
            if (t === "bugfix") return `<span class="badge me-1" style="background:rgba(245,158,11,0.15);color:#fbbf24;font-size:0.7rem;">Bug Fixed</span>`;
            if (t === "improvement") return `<span class="badge me-1" style="background:rgba(99,102,241,0.15);color:#a5b4fc;font-size:0.7rem;">Improvement</span>`;
            return "";
        }).join("");

        const isLatest = i === 0;
        container.innerHTML += `
            <div class="evo-item ${isLatest ? 'evo-item-active' : ''}" style="position:relative;padding-left:24px;padding-bottom:${i < versions.length - 1 ? '24' : '0'}px;border-left:2px solid ${isLatest ? 'var(--primary)' : 'var(--border-color)'};">
                <div style="position:absolute;left:-7px;top:0;width:12px;height:12px;border-radius:50%;background:${isLatest ? 'var(--primary)' : 'rgba(255,255,255,0.15)'};border:2px solid ${isLatest ? 'var(--primary)' : 'var(--border-color)'};"></div>
                <div class="fw-bold text-white" style="font-size:0.9rem;">Version ${v.version} ${v.label || ''}</div>
                <div class="text-secondary" style="font-size:0.75rem;">${v.date}, ${v.time}</div>
                <div class="text-secondary small mt-1">${v.desc}</div>
                <div class="mt-2">${tagHtml}</div>
                ${v.complexity ? `<div class="text-secondary mt-1" style="font-size:0.7rem;">Complexity: ${v.complexity}</div>` : ''}
            </div>
        `;
    });

    // Populate code diff panels
    const oldCode = document.getElementById("diff-old-code");
    const newCode = document.getElementById("diff-new-code");
    if (oldCode) {
        oldCode.innerHTML = formatDiffLines([
            { n: 1, t: 'def binarySearch(arr, target):', s: 'normal' },
            { n: 2, t: '    low, high = 0, len(arr)-1', s: 'normal' },
            { n: 3, t: '    while low <= high:', s: 'normal' },
            { n: 4, t: '        mid = (low + high) // 2', s: 'removed' },
            { n: 5, t: '        if arr[mid] == target:', s: 'normal' },
            { n: 6, t: '            return mid', s: 'normal' },
            { n: 7, t: '        elif arr[mid] < target:', s: 'removed' },
            { n: 8, t: '            low = mid + 1', s: 'normal' },
            { n: 9, t: '        else:', s: 'normal' },
            { n: 10, t: '            high = mid - 1', s: 'normal' },
            { n: 11, t: '    return -1', s: 'normal' }
        ]);
    }
    if (newCode) {
        newCode.innerHTML = formatDiffLines([
            { n: 1, t: 'def binarySearch(arr, target):', s: 'normal' },
            { n: 2, t: '    if not arr:', s: 'added' },
            { n: 3, t: '        return -1', s: 'added' },
            { n: 4, t: '    low, high = 0, len(arr)-1', s: 'normal' },
            { n: 5, t: '    while low <= high:', s: 'normal' },
            { n: 6, t: '        mid = low + (high - low) // 2', s: 'added' },
            { n: 7, t: '        if arr[mid] == target:', s: 'normal' },
            { n: 8, t: '            return mid', s: 'normal' },
            { n: 9, t: '        elif arr[mid] < target:', s: 'normal' },
            { n: 10, t: '            low = mid + 1', s: 'normal' },
            { n: 11, t: '        else:', s: 'normal' },
            { n: 12, t: '            high = mid - 1', s: 'normal' },
            { n: 13, t: '    return -1', s: 'normal' }
        ]);
    }
}

function formatDiffLines(lines) {
    return lines.map(l => {
        let bg = 'transparent';
        let color = '#94a3b8';
        if (l.s === 'added') { bg = 'rgba(16,185,129,0.12)'; color = '#34d399'; }
        if (l.s === 'removed') { bg = 'rgba(239,68,68,0.12)'; color = '#f87171'; }
        const num = String(l.n).padStart(2, ' ');
        return `<div style="background:${bg};padding:1px 8px;white-space:pre;"><span style="color:rgba(148,163,184,0.4);margin-right:12px;">${num}</span><span style="color:${color};">${escapeHtml(l.t)}</span></div>`;
    }).join('');
}

function escapeHtml(text) {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return text.replace(/[&<>"']/g, m => map[m]);
}

// ============================================================================
// Daily AI Mission — Initialization & Dummy Data
// ============================================================================

function initDailyMission() {
    // Set today's date
    const dateEl = document.getElementById("mission-date");
    if (dateEl) {
        const now = new Date();
        dateEl.textContent = now.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
    }

    const missions = [
        { title: "Solve 2 Array Questions", desc: "Practice array problems", progress: 1, total: 2, xp: 50, coins: 20, icon: "bi-code-square", iconColor: "#6366f1", status: "in-progress" },
        { title: "Fix 1 Bug", desc: "Debug and fix any code bug", progress: 0, total: 1, xp: 40, coins: 15, icon: "bi-bug-fill", iconColor: "#ef4444", status: "pending" },
        { title: "Read about HashMap", desc: "Learn HashMap in detail", progress: 0, total: 1, xp: 30, coins: 10, icon: "bi-book-fill", iconColor: "#f59e0b", status: "pending" },
        { title: "Complete Quiz", desc: "Complete today's coding quiz", progress: 0, total: 1, xp: 50, coins: 20, icon: "bi-question-diamond-fill", iconColor: "#8b5cf6", status: "pending" },
        { title: "Build Login Page", desc: "Build a simple login page", progress: 0, total: 1, xp: 60, coins: 25, icon: "bi-window-stack", iconColor: "#10b981", status: "pending" }
    ];

    const container = document.getElementById("mission-tasks-container");
    if (!container) return;
    container.innerHTML = "";

    missions.forEach((m, idx) => {
        const pct = Math.round((m.progress / m.total) * 100);
        const isComplete = m.progress >= m.total;
        const statusBadge = isComplete
            ? `<span class="badge" style="background:rgba(16,185,129,0.15);color:#34d399;">Done</span>`
            : m.status === "in-progress"
                ? `<span class="badge" style="background:rgba(99,102,241,0.15);color:#a5b4fc;">In Progress</span>`
                : `<span class="badge" style="background:rgba(255,255,255,0.05);color:#94a3b8;">Pending</span>`;

        container.innerHTML += `
            <div class="glass-panel p-3 mb-3 d-flex align-items-center gap-3 mission-task-item">
                <div class="rounded-circle d-flex align-items-center justify-content-center flex-shrink-0" style="width:42px;height:42px;background:${m.iconColor}20;">
                    <i class="bi ${m.icon} fs-5" style="color:${m.iconColor};"></i>
                </div>
                <div class="flex-grow-1">
                    <div class="d-flex justify-content-between align-items-center mb-1">
                        <div class="fw-bold text-white" style="font-size:0.9rem;">${m.title}</div>
                        <div class="d-flex align-items-center gap-2">
                            <span class="text-secondary" style="font-size:0.75rem;">${m.progress} / ${m.total}</span>
                            ${statusBadge}
                        </div>
                    </div>
                    <div class="text-secondary" style="font-size:0.75rem;margin-bottom:6px;">${m.desc}</div>
                    <div class="d-flex align-items-center gap-3">
                        <div class="flex-grow-1">
                            <div class="progress" style="height:6px;background:rgba(255,255,255,0.06);border-radius:3px;">
                                <div class="progress-bar" role="progressbar" style="width:${pct}%;background:${pct >= 100 ? '#10b981' : 'var(--primary)'};border-radius:3px;transition:width 0.5s ease;"></div>
                            </div>
                        </div>
                        <div class="d-flex align-items-center gap-2 flex-shrink-0">
                            <span style="font-size:0.7rem;color:#fbbf24;"><i class="bi bi-star-fill me-1"></i>${m.xp}</span>
                            <span style="font-size:0.7rem;color:#f59e0b;"><i class="bi bi-coin me-1"></i>${m.coins}</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    });
}

