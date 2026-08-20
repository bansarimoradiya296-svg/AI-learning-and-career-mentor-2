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
function switchTab(tabId, clickedEl) {
    activeTab = tabId;

    // Nav highlight
    if (clickedEl) {
        document.querySelectorAll("#main-sidebar-nav .nav-link-custom").forEach(el => el.classList.remove("active"));
        clickedEl.classList.add("active");
    }

    // Set headers
    const title = document.getElementById("tab-title");
    const subtitle = document.getElementById("tab-subtitle");

    // Sidebar nav toggling
    if (tabId === "interview") {
        document.getElementById("main-sidebar-nav").classList.add("d-none");
        document.getElementById("interview-sidebar-nav").classList.remove("d-none");
        document.querySelector(".logo-text").innerText = "Interview Sim";

        // Show interview panel
        document.querySelectorAll(".tab-pane-custom").forEach(el => el.classList.add("d-none"));
        document.getElementById(`tab-interview`).classList.remove("d-none");

        switchInterviewSubTab("dashboard");
        return;
    } else {
        document.getElementById("interview-sidebar-nav").classList.add("d-none");
        document.getElementById("main-sidebar-nav").classList.remove("d-none");
        document.querySelector(".logo-text").innerText = "AI Mentor";
    }

    // Pane visibility
    document.querySelectorAll(".tab-pane-custom").forEach(el => el.classList.add("d-none"));
    document.getElementById(`tab-${tabId}`).classList.remove("d-none");

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
    } else if (tabId === "admin") {
        title.innerText = "Admin Management Portal";
        subtitle.innerText = "Monitor security logs and manage system users.";
        loadAdminPanelData();
    } else if (tabId === "portfolio_guidance") {
        title.innerText = "Portfolio Guidance";
        subtitle.innerText = "Assess and optimize your project portfolio, resume, LinkedIn, and GitHub profiles.";
        initPortfolioGuidanceTab();
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
    } catch (e) { }
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
    } catch (e) { }
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
    } catch (e) { }
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
    } catch (e) { }
}

// ==========================================
// 5. Mock Interview Simulator Logic
// ==========================================
let activeInterviewSubTab = "dashboard";
let webcamStream = null;
let simulatedMicInterval = null;
let currentTimerInterval = null;
let currentInterviewTimer = 0; // in seconds

let setupParams = {
    type: "TECHNICAL",
    difficulty: "MEDIUM",
    duration: "30",
    language: "ENGLISH"
};

// Local simulation fallbacks
let isLocalSimulation = false;
let localQuestionIdx = 0;
let localSessionQuestions = [];
let chatTranscript = [];

// Chart instances
let simScoreChart = null;
let analysisRadarChart = null;
let growthScoreChart = null;
let confidenceProgressionChart = null;

function switchInterviewSubTab(subTabId) {
    activeInterviewSubTab = subTabId;

    // Hide all sub-panes
    document.querySelectorAll(".interview-subpane").forEach(el => el.classList.add("d-none"));

    // Show selected sub-pane
    const subPane = document.getElementById(`interview-subtab-${subTabId}`);
    if (subPane) subPane.classList.remove("d-none");

    // Highlight sub-nav items
    const interviewNav = document.getElementById("interview-sidebar-nav");
    interviewNav.querySelectorAll(".nav-link-custom").forEach(el => el.classList.remove("active"));

    const activeLink = interviewNav.querySelector(`[onclick="switchInterviewSubTab('${subTabId}')"]`);
    if (activeLink) activeLink.classList.add("active");

    // Headers title and subtitle setting
    const title = document.getElementById("tab-title");
    const subtitle = document.getElementById("tab-subtitle");

    if (subTabId === "dashboard") {
        title.innerText = "Interview Dashboard";
        subtitle.innerText = "Ready to ace your next interview?";
        loadInterviewDashboardData();
    } else if (subTabId === "setup") {
        title.innerText = "Interview Setup";
        subtitle.innerText = "Customize your interactive interview experience.";
    } else if (subTabId === "live") {
        title.innerText = "Live Interview";
        subtitle.innerText = "Practice single interviewer mock simulator.";
    } else if (subTabId === "panel") {
        title.innerText = "Panel Interview";
        subtitle.innerText = "Practice panel interview mock simulator.";
        initiatePanelSimulation();
    } else if (subTabId === "analysis") {
        title.innerText = "Live AI Analysis";
        subtitle.innerText = "Real-time performance insights and cognitive analytics.";
        loadLiveAnalysisData();
    } else if (subTabId === "report") {
        title.innerText = "Final Interview Report";
        subtitle.innerText = "Detailed evaluation and comprehensive feedback.";
    } else if (subTabId === "history") {
        title.innerText = "Interview History";
        subtitle.innerText = "Track and review your previous mock interview sessions.";
        loadInterviewHistoryTable();
    } else if (subTabId === "performance") {
        title.innerText = "Performance Analytics";
        subtitle.innerText = "Detailed progress overview and learning curve.";
        loadPerformanceAnalytics();
    } else if (subTabId === "portfolio") {
        title.innerText = "Portfolio Guidance";
        subtitle.innerText = "Assess and optimize your project portfolio for job applications.";
        loadPortfolioGuidance();
    }
}

function exitInterviewSimulator() {
    // Stop camera if running
    if (webcamStream) {
        webcamStream.getTracks().forEach(track => track.stop());
        webcamStream = null;
    }
    clearInterval(simulatedMicInterval);
    clearInterval(currentTimerInterval);

    // Restore sidebar navigation view
    document.getElementById("interview-sidebar-nav").classList.add("d-none");
    document.getElementById("main-sidebar-nav").classList.remove("d-none");
    document.querySelector(".logo-text").innerText = "AI Mentor";

    // Highlight dashboard
    document.querySelectorAll("#main-sidebar-nav .nav-link-custom").forEach(el => el.classList.remove("active"));
    const mainDashboardLink = document.querySelector(`#main-sidebar-nav [onclick="switchTab('dashboard')"]`);
    if (mainDashboardLink) mainDashboardLink.classList.add("active");

    // Switch pane to main dashboard
    switchTab("dashboard");
}

function updateSetupPreview(field, val, element) {
    setupParams[field] = val;

    // Highlight selected button
    const container = element.parentElement;
    container.querySelectorAll(".btn").forEach(btn => btn.classList.remove("active"));
    element.classList.add("active");

    // Update preview labels
    if (field === "type") {
        document.getElementById("preview-type").innerText = val.charAt(0) + val.slice(1).toLowerCase() + " Interview";
        const pTone = document.getElementById("preview-personality");
        if (val === "TECHNICAL") pTone.innerText = "Friendly Mentor";
        else if (val === "HR") pTone.innerText = "Strict Recruiter";
        else if (val === "CODING") pTone.innerText = "Fast-Paced Senior Developer";
        else pTone.innerText = "Board of Directors";
    } else if (field === "difficulty") {
        document.getElementById("preview-difficulty").innerText = val.charAt(0) + val.slice(1).toLowerCase();
    } else if (field === "duration") {
        setupParams[field] = val.split(" ")[0];
        document.getElementById("preview-duration").innerText = val.split(" ")[0] + " Minutes";
    } else if (field === "language") {
        document.getElementById("preview-language").innerText = val.charAt(0) + val.slice(1).toLowerCase();
    }
}

async function toggleWebcamState(enabled) {
    const video = document.getElementById("candidate-webcam");
    const fallback = document.getElementById("webcam-fallback-msg");
    const previewVideo = document.getElementById("setup-preview-webcam");
    const previewFallback = document.getElementById("setup-webcam-fallback");

    if (enabled) {
        try {
            webcamStream = await navigator.mediaDevices.getUserMedia({ video: true });

            // Assign to setup preview video
            if (previewVideo) {
                previewVideo.srcObject = webcamStream;
                previewVideo.classList.remove("d-none");
            }
            if (previewFallback) previewFallback.classList.add("d-none");

            // Assign to live video
            if (video) {
                video.srcObject = webcamStream;
                video.classList.remove("d-none");
            }
            if (fallback) fallback.classList.add("d-none");
        } catch (e) {
            console.error("Camera access denied: ", e);
            document.getElementById("setup-camera-toggle").checked = false;
            if (video) video.classList.add("d-none");
            if (fallback) fallback.classList.remove("d-none");
            if (previewVideo) previewVideo.classList.add("d-none");
            if (previewFallback) previewFallback.classList.remove("d-none");
            alert("Unable to access camera device. Please verify browser permissions.");
        }
    } else {
        if (webcamStream) {
            webcamStream.getTracks().forEach(track => track.stop());
            webcamStream = null;
        }
        if (video) video.classList.add("d-none");
        if (fallback) fallback.classList.remove("d-none");
        if (previewVideo) previewVideo.classList.add("d-none");
        if (previewFallback) previewFallback.classList.remove("d-none");
    }
}

function toggleSimulatedMic() {
    const wave = document.getElementById("simulated-mic-waveform");
    const icon = document.getElementById("live-mic-icon");

    if (wave.classList.contains("d-none")) {
        wave.classList.remove("d-none");
        icon.className = "bi bi-mic-mute-fill text-danger";
        // Start simulated waves animation
        simulatedMicInterval = setInterval(() => {
            document.querySelectorAll(".wave-bar").forEach(bar => {
                const randomHeight = Math.floor(Math.random() * 26) + 8;
                bar.style.height = randomHeight + "px";
            });
        }, 150);
    } else {
        wave.classList.add("d-none");
        icon.className = "bi bi-mic-fill text-info";
        clearInterval(simulatedMicInterval);
    }
}

async function loadInterviewDashboardData() {
    if (!accessToken) return;
    try {
        const res = await fetch(`${API_ROOT}/interview/sessions`, {
            headers: { "Authorization": `Bearer ${accessToken}` }
        });
        if (res.ok) {
            const sessions = await res.json();
            const total = sessions.length;
            const completed = sessions.filter(s => s.status === "COMPLETED");

            // Stats updates
            document.getElementById("sim-dash-total").innerText = total;

            let avgScore = 0.0;
            if (completed.length > 0) {
                const totalScore = completed.reduce((sum, s) => sum + (s.report ? s.report.overall_score : 70.0), 0.0);
                avgScore = Math.round(totalScore / completed.length);
            }
            document.getElementById("sim-dash-avg").innerText = avgScore > 0 ? avgScore + "%" : "0%";
            document.getElementById("sim-dash-readiness").innerText = avgScore > 0 ? Math.min(avgScore + 5, 98) + "%" : "0%";
            document.getElementById("sim-dash-success").innerText = total > 0 ? Math.round((completed.length / total) * 100) + "%" : "0%";

            // Build recent lists
            const recentContainer = document.getElementById("sim-recent-list");
            recentContainer.innerHTML = "";

            if (sessions.length === 0) {
                recentContainer.innerHTML = `<div class="text-secondary text-center py-3">No completed runs.</div>`;
            } else {
                sessions.slice(0, 3).forEach(sess => {
                    const item = document.createElement("div");
                    item.className = "list-group-item bg-transparent text-white px-0 py-2 border-0 border-bottom border-secondary border-opacity-10 d-flex justify-content-between align-items-center";
                    let scoreBadge = `<span class="badge bg-secondary">In Progress</span>`;
                    if (sess.status === "COMPLETED" && sess.report) {
                        scoreBadge = `<span class="badge bg-success">Score: ${sess.report.overall_score}%</span>`;
                    }
                    item.innerHTML = `
                        <div>
                            <div class="fw-bold">${sess.type.charAt(0) + sess.type.slice(1).toLowerCase()} Mock Session</div>
                            <small class="text-secondary">Date: ${new Date(sess.started_at).toLocaleDateString()} | Status: ${sess.status}</small>
                        </div>
                        <div>${scoreBadge}</div>
                    `;
                    recentContainer.appendChild(item);
                });
            }

            // Build visual Chart.js score history
            renderDashboardLineChart(completed);
        }
    } catch (e) {
        console.error("Dashboard failed to load: ", e);
    }
}

function renderDashboardLineChart(completedSessions) {
    const ctx = document.getElementById("simScoreChart").getContext("2d");

    // Destroy previous instance
    if (simScoreChart) simScoreChart.destroy();

    // Sort chronological
    const sorted = [...completedSessions].sort((a, b) => new Date(a.started_at) - new Date(b.started_at)).slice(-6);

    const labels = sorted.map((s, idx) => `Session ${idx + 1}`);
    const scores = sorted.map(s => s.report ? s.report.overall_score : 70);

    // Fallback static points if empty
    const finalLabels = labels.length > 0 ? labels : ["Run 1", "Run 2", "Run 3"];
    const finalScores = scores.length > 0 ? scores : [65, 75, 78];

    simScoreChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: finalLabels,
            datasets: [{
                label: 'Grade Score %',
                data: finalScores,
                borderColor: '#6366f1',
                backgroundColor: 'rgba(99, 102, 241, 0.15)',
                borderWidth: 3,
                tension: 0.4,
                fill: true,
                pointBackgroundColor: '#8b5cf6',
                pointBorderColor: '#fff',
                pointRadius: 5
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { min: 0, max: 100, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } },
                x: { grid: { display: false }, ticks: { color: '#94a3b8' } }
            }
        }
    });
}

function triggerQuickInterview(type) {
    setupParams.type = type;
    switchInterviewSubTab("setup");

    // Select correct button visually
    const group = document.getElementById("setup-type-group");
    group.querySelectorAll(".btn").forEach(btn => btn.classList.remove("active"));
    const activeBtn = group.querySelector(`[data-value="${type}"]`);
    if (activeBtn) activeBtn.classList.add("active");

    // Update preview labels
    document.getElementById("preview-type").innerText = type.charAt(0) + type.slice(1).toLowerCase() + " Interview";
}

function getLocalQuestions(type) {
    const questions = {
        TECHNICAL: [
            "Hello! Welcome to your technical mock interview today. To start off, could you tell me a bit about yourself and your background?",
            "Great! Since this is a backend technical round, let's start with databases. Can you explain the difference between relational (SQL) and non-relational (NoSQL) databases?",
            "Excellent. In relational databases, what are indexes and how do they optimize query performance? Are there any downsides to indexing?",
            "Good points. Now let's switch to system design. How would you design a rate limiter for a public-facing API?",
            "Very interesting. Let's wrap up with coding concepts. What is the difference between concurrency and parallelism, and how do you handle them in your preferred programming language?",
            "Excellent! That brings us to the end of the interview questions. Do you have any questions for me?"
        ],
        HR: [
            "Hello! Welcome to your HR screening mock interview today. Tell me a bit about yourself and your career journey.",
            "Why are you interested in joining our company, and what unique value do you bring to our team?",
            "Can you describe a time when you had a conflict with a team member or manager, and how you resolved it?",
            "What are your salary expectations and long-term career goals for the next 3 to 5 years?",
            "Excellent. Do you have any questions for us regarding the company culture or job expectations?"
        ],
        CODING: [
            "Welcome to the coding assessment round. Let's start with a classic problem: How would you find the two numbers in an array that add up to a target value?",
            "Great. What is the time complexity of your approach? Can we optimize it to linear time using a hash map?",
            "Good job. How would you implement a function to check if a binary tree is balanced?",
            "Very good. That completes our coding round questions. Any final thoughts on optimizing these algorithms?"
        ],
        BEHAVIORAL: [
            "Welcome! Let's start by discussing your background and key technical achievements.",
            "How do you handle tight deadlines or changing project requirements? Can you give an example?",
            "Can you explain a complex technical issue you encountered and how you broke it down to solve it?",
            "Excellent! Do you have any questions for me?"
        ]
    };
    return questions[type] || questions.TECHNICAL;
}

function activateLocalFallback(chatPane) {
    isLocalSimulation = true;
    chatPane.innerHTML = `<p class="text-warning small border-bottom border-warning border-opacity-10 pb-2"><i class="bi bi-exclamation-triangle-fill me-2"></i> Backend session offline. Switched to client-side local simulation mode.</p>`;

    localSessionQuestions = getLocalQuestions(setupParams.type);
    const openingQ = localSessionQuestions[0];

    setTimeout(() => {
        appendChatMessage("INTERVIEWER", openingQ);
        chatTranscript.push({ sender: "INTERVIEWER", text: openingQ });

        document.getElementById("live-user-input").removeAttribute("disabled");
        document.getElementById("live-send-btn").removeAttribute("disabled");
        document.getElementById("live-user-input").focus();

        updateLocalSimulationProgress();
    }, 500);
}

function updateLocalSimulationProgress() {
    const total = localSessionQuestions.length;
    const current = localQuestionIdx + 1;

    document.getElementById("progress-questions-badge").innerText = `Question ${current} of ${total}`;

    const pct = Math.round((current / total) * 100);
    document.getElementById("progress-bar-line").style.width = pct + "%";

    // Highlight round checkpoints in the checklist list
    const roundsList = document.getElementById("progress-rounds-list");
    if (!roundsList) return;

    let html = "";
    const roundNames = [
        "Introduction",
        "Technical Round",
        "Problem Solving",
        "System Design",
        "HR Round",
        "Final Discussion"
    ];

    const activeRoundIdx = Math.min(Math.floor((localQuestionIdx / total) * roundNames.length), roundNames.length - 1);

    roundNames.forEach((name, idx) => {
        if (idx < activeRoundIdx) {
            html += `<li class="mb-1 text-success"><i class="bi bi-check-circle-fill me-2"></i> ${name}</li>`;
        } else if (idx === activeRoundIdx) {
            html += `<li class="mb-1 text-white fw-bold"><i class="bi bi-arrow-right-circle-fill text-primary me-2"></i> ${name}</li>`;
        } else {
            html += `<li class="mb-1 opacity-50"><i class="bi bi-circle me-2"></i> ${name}</li>`;
        }
    });
    roundsList.innerHTML = html;
}

function updateWebSocketProgress() {
    const interviewerMessages = chatTranscript.filter(m => m.sender === "INTERVIEWER").length;
    const total = 12; // Assuming default 12 questions
    const current = Math.min(interviewerMessages, total);

    document.getElementById("progress-questions-badge").innerText = `Question ${current} of ${total}`;
    const pct = Math.round((current / total) * 100);
    document.getElementById("progress-bar-line").style.width = pct + "%";

    const roundsList = document.getElementById("progress-rounds-list");
    if (!roundsList) return;

    let html = "";
    const roundNames = [
        "Introduction",
        "Technical Round",
        "Problem Solving",
        "System Design",
        "HR Round",
        "Final Discussion"
    ];

    const activeRoundIdx = Math.min(Math.floor(((current - 1) / total) * roundNames.length), roundNames.length - 1);

    roundNames.forEach((name, idx) => {
        if (idx < activeRoundIdx) {
            html += `<li class="mb-1 text-success"><i class="bi bi-check-circle-fill me-2"></i> ${name}</li>`;
        } else if (idx === activeRoundIdx) {
            html += `<li class="mb-1 text-white fw-bold"><i class="bi bi-arrow-right-circle-fill text-primary me-2"></i> ${name}</li>`;
        } else {
            html += `<li class="mb-1 opacity-50"><i class="bi bi-circle me-2"></i> ${name}</li>`;
        }
    });
    roundsList.innerHTML = html;
}

async function startSetupInterview() {
    // Reset local transcript and states
    chatTranscript = [];
    localQuestionIdx = 0;

    // Set labels
    const displayType = setupParams.type.charAt(0) + setupParams.type.slice(1).toLowerCase();
    document.getElementById("live-session-title").innerText = `${displayType} Interview`;
    document.getElementById("live-session-topic").innerText = `Level: ${setupParams.difficulty} | Language: ${setupParams.language}`;
    document.getElementById("live-interviewer-label").innerText = `Interviewer (${document.getElementById("preview-personality").innerText})`;

    // Set footer info bar items
    document.getElementById("footer-topic").innerText = setupParams.type === "TECHNICAL" ? "Database Management & APIs" : (setupParams.type === "CODING" ? "Data Structures & Algorithms" : "Workplace Scenarios");
    document.getElementById("footer-difficulty").innerText = setupParams.difficulty.charAt(0) + setupParams.difficulty.slice(1).toLowerCase();
    document.getElementById("footer-env").innerText = "MNC Environment";
    document.getElementById("footer-type").innerText = displayType;

    // Show live tab first so DOM elements are visible
    switchInterviewSubTab("live");

    // Clear chat pane
    const chatPane = document.getElementById("live-chat-pane");
    chatPane.innerHTML = "";

    // Start timer
    clearInterval(currentTimerInterval);
    const durationMinutes = parseInt(setupParams.duration) || 30;
    currentInterviewTimer = durationMinutes * 60;
    updateTimerBadgeDisplay();

    currentTimerInterval = setInterval(() => {
        if (currentInterviewTimer > 0) {
            currentInterviewTimer--;
            updateTimerBadgeDisplay();
        } else {
            clearInterval(currentTimerInterval);
            endCurrentInterview();
        }
    }, 1000);

    // If there is no accessToken, or if the user is a Guest, we run in Local Simulation Mode!
    if (!accessToken || currentUser?.email === "guest@aimentor.com") {
        isLocalSimulation = true;
        console.log("Starting local simulation mode...");

        chatPane.innerHTML = `<p class="text-warning small border-bottom border-warning border-opacity-10 pb-2"><i class="bi bi-info-circle-fill me-2"></i> Running in client-side simulation mode (Guest account / Offline fallback). All functions are active.</p>`;

        localSessionQuestions = getLocalQuestions(setupParams.type);
        const openingQ = localSessionQuestions[0];

        // Append opening question
        setTimeout(() => {
            appendChatMessage("INTERVIEWER", openingQ);
            chatTranscript.push({ sender: "INTERVIEWER", text: openingQ });

            // Enable text box and Send button!
            document.getElementById("live-user-input").removeAttribute("disabled");
            document.getElementById("live-send-btn").removeAttribute("disabled");
            document.getElementById("live-user-input").focus();

            updateLocalSimulationProgress();
            simulateLiveEvaluationTick();
        }, 800);
        return;
    }

    isLocalSimulation = false;
    chatPane.innerHTML = `<p class="text-secondary text-center py-4">Connecting to live mock interviewer websocket...</p>`;

    try {
        const res = await fetch(`${API_ROOT}/interview/sessions`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${accessToken}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ type: setupParams.type })
        });

        if (res.ok) {
            const data = await res.json();
            activeInterviewSessionId = data.id;

            const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
            const wsUrl = `${wsProtocol}//${window.location.host}${API_ROOT}/interview/ws/${data.id}?token=${accessToken}&difficulty=${setupParams.difficulty}&duration=${parseInt(setupParams.duration)}&language=${setupParams.language}`;

            activeWebSocket = new WebSocket(wsUrl);

            activeWebSocket.onopen = () => {
                chatPane.innerHTML = `<p class="text-success small border-bottom border-secondary border-opacity-10 pb-2"><i class="bi bi-cpu-fill me-2"></i> Interviewer connected. Start talking or typing your answers.</p>`;
                document.getElementById("live-user-input").removeAttribute("disabled");
                document.getElementById("live-send-btn").removeAttribute("disabled");
                document.getElementById("live-user-input").focus();
            };

            activeWebSocket.onmessage = (event) => {
                const msg = JSON.parse(event.data);
                if (msg.sender === "REPORT") {
                    renderFinalEvaluationReport(msg.report);
                } else if (msg.sender === "INTERVIEWER") {
                    appendChatMessage("INTERVIEWER", msg.text);
                    chatTranscript.push({ sender: "INTERVIEWER", text: msg.text });
                    simulateLiveEvaluationTick();
                    updateWebSocketProgress();
                } else if (msg.sender === "STUDENT") {
                    appendChatMessage("STUDENT", msg.text);
                    chatTranscript.push({ sender: "STUDENT", text: msg.text });
                } else {
                    appendChatMessage("SYSTEM", msg.text);
                }
            };

            activeWebSocket.onclose = () => {
                console.log("WebSocket session closed");
            };

            activeWebSocket.onerror = () => {
                activateLocalFallback(chatPane);
            };
        } else {
            activateLocalFallback(chatPane);
        }
    } catch (e) {
        activateLocalFallback(chatPane);
    }
}

function simulateLiveEvaluationTick() {
    // Generate slight random updates to keep dashboard feeling live
    const tech = Math.floor(Math.random() * 15) + 75;
    const conf = Math.floor(Math.random() * 15) + 70;
    const comm = Math.floor(Math.random() * 15) + 72;
    const prob = Math.floor(Math.random() * 15) + 75;

    document.getElementById("live-eval-tech").innerText = tech + "%";
    document.getElementById("live-eval-conf").innerText = conf + "%";
    document.getElementById("live-eval-comm").innerText = comm + "%";
    document.getElementById("live-eval-prob").innerText = prob + "%";

    // Update SVG circles dash offsets
    updateLiveGaugeOffset("live-gauge-tech-circle", tech);
    updateLiveGaugeOffset("live-gauge-conf-circle", conf);
    updateLiveGaugeOffset("live-gauge-comm-circle", comm);
    updateLiveGaugeOffset("live-gauge-prob-circle", prob);
}

function updateLiveGaugeOffset(elementId, value) {
    const circle = document.getElementById(elementId);
    if (!circle) return;
    const circumference = 188; // 2 * pi * r = 188.4
    const offset = circumference - (value / 100) * circumference;
    circle.style.strokeDashoffset = offset;
}

function updateTimerBadgeDisplay() {
    const minutes = Math.floor(currentInterviewTimer / 60);
    const seconds = currentInterviewTimer % 60;
    document.getElementById("live-timer-badge").innerText = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
}

function sendLiveResponse() {
    const input = document.getElementById("live-user-input");
    const text = input.value.trim();
    if (!text) return;

    // Stop mic waveform if running
    const wave = document.getElementById("simulated-mic-waveform");
    if (!wave.classList.contains("d-none")) {
        toggleSimulatedMic();
    }

    // Add user message to UI
    appendChatMessage("STUDENT", text);
    chatTranscript.push({ sender: "STUDENT", text: text });
    input.value = "";

    if (isLocalSimulation) {
        // Trigger simulated typing indicator
        document.getElementById("live-user-input").setAttribute("disabled", "true");
        document.getElementById("live-send-btn").setAttribute("disabled", "true");

        setTimeout(() => {
            localQuestionIdx++;
            if (localQuestionIdx < localSessionQuestions.length) {
                const nextQ = localSessionQuestions[localQuestionIdx];
                appendChatMessage("INTERVIEWER", nextQ);
                chatTranscript.push({ sender: "INTERVIEWER", text: nextQ });

                // Update live progress checklist and gauges
                updateLocalSimulationProgress();
                simulateLiveEvaluationTick();

                document.getElementById("live-user-input").removeAttribute("disabled");
                document.getElementById("live-send-btn").removeAttribute("disabled");
                document.getElementById("live-user-input").focus();
            } else {
                // End of local session
                appendChatMessage("SYSTEM", "All questions completed. Please click 'End Interview' to see your final report card.");
                document.getElementById("live-user-input").removeAttribute("disabled");
                document.getElementById("live-send-btn").removeAttribute("disabled");
            }
        }, 1500);
    } else {
        if (activeWebSocket) {
            activeWebSocket.send(text);
        }
    }
}

function appendChatMessage(sender, text) {
    const chatPane = document.getElementById("live-chat-pane");
    if (!chatPane) return;

    if (sender === "INTERVIEWER") {
        chatPane.innerHTML += `
            <div class="mb-3 d-flex align-items-start gap-2">
                <img src="/static/images/interviewer_avatar.png" class="avatar-rounded" style="width: 36px; height: 36px;">
                <div class="p-3 rounded glass-panel text-white" style="background: rgba(99, 102, 241, 0.1); border-color: rgba(99,102,241,0.2); max-width: 80%;">
                    <strong class="text-primary d-block mb-1">Interviewer:</strong>
                    <span>${text}</span>
                </div>
            </div>
        `;
    } else if (sender === "STUDENT") {
        chatPane.innerHTML += `
            <div class="mb-3 d-flex align-items-start gap-2 justify-content-end">
                <div class="p-3 rounded glass-panel text-white text-end" style="background: rgba(255,255,255,0.05); max-width: 80%;">
                    <strong class="text-info d-block mb-1">You:</strong>
                    <span>${text}</span>
                </div>
                <div class="bg-primary rounded-circle p-2 text-center" style="width: 36px; height: 36px; line-height: 20px;"><i class="bi bi-person-fill text-white"></i></div>
            </div>
        `;
    } else {
        chatPane.innerHTML += `<div class="mb-2 text-secondary text-center small">${text}</div>`;
    }
    chatPane.scrollTop = chatPane.scrollHeight;
}

function endCurrentInterview() {
    const confirmed = window.bypassConfirm || confirm("Are you sure you want to end the interview session?");
    if (!confirmed) return;

    clearInterval(currentTimerInterval);

    // Stop camera if running
    if (webcamStream) {
        webcamStream.getTracks().forEach(track => track.stop());
        webcamStream = null;
    }
    clearInterval(simulatedMicInterval);

    if (!isLocalSimulation && activeWebSocket && activeWebSocket.readyState === WebSocket.OPEN) {
        // Ask server to generate final report
        activeWebSocket.send("/end");
    } else {
        // Compile mock report client-side!
        const score = Math.floor(Math.random() * 15) + 78; // Random score between 78 and 92
        const report = {
            overall_score: score,
            technical_score: Math.min(score + 2, 98),
            communication_score: Math.max(score - 4, 60),
            confidence_score: Math.min(score + 4, 98),
            evaluation_summary: {
                strengths: [
                    "Strong background understanding and MVC articulation",
                    "Exceptional responsiveness during coding rounds",
                    "Clear distinction of relational and non-relational database schemas"
                ],
                weaknesses: [
                    "Slight hesitation when explaining complex design pattern tradeoffs",
                    "Pacing could be improved during high-stress problem solving",
                    "Could specify exact database isolation levels in database answers"
                ],
                suggestions: [
                    "Try to expand answers with more concrete production examples",
                    "Maintain steady posture and eye level when explaining concurrency",
                    "Incorporate token lifetime constraints when designing security features"
                ]
            }
        };
        renderFinalEvaluationReport(report);
    }
}

function renderFinalEvaluationReport(report) {
    // Clean states
    document.getElementById("live-user-input").setAttribute("disabled", "true");
    document.getElementById("live-send-btn").setAttribute("disabled", "true");
    activeWebSocket = null;
    activeInterviewSessionId = null;

    // Populate report tabs
    document.getElementById("report-overall-score").innerText = report.overall_score + "%";

    // Adjust visual gauge offset
    const circle = document.getElementById("report-gauge-circle");
    if (circle) {
        const radius = circle.r.baseVal.value;
        const circumference = 2 * Math.PI * radius;
        const offset = circumference - (report.overall_score / 100) * circumference;
        circle.style.strokeDashoffset = offset;
    }

    // Update Placement Readiness score and gauge on report tab
    const readinessScore = Math.min(report.overall_score + 4, 98);
    document.getElementById("report-readiness-val").innerText = readinessScore + "%";

    // Star rating rendering
    const starContainer = document.getElementById("report-stars");
    starContainer.innerHTML = "";
    const stars = Math.round((report.overall_score / 100) * 5);
    for (let i = 0; i < 5; i++) {
        if (i < stars) {
            starContainer.innerHTML += `<i class="bi bi-star-fill text-warning fs-5"></i> `;
        } else {
            starContainer.innerHTML += `<i class="bi bi-star text-secondary fs-5"></i> `;
        }
    }

    const comment = document.getElementById("report-overall-comment");
    if (report.overall_score >= 85) comment.innerText = "Outstanding Performance!";
    else if (report.overall_score >= 75) comment.innerText = "Very Good!";
    else if (report.overall_score >= 60) comment.innerText = "Needs Minor Practice";
    else comment.innerText = "Further Preparation Required";

    // Decision card updates
    const badge = document.getElementById("report-decision-badge");
    const decisionDesc = document.getElementById("report-decision-desc");
    const decPanel = document.getElementById("report-decision-panel");
    if (report.overall_score >= 70) {
        badge.className = "badge bg-success p-2 px-3 fs-5 my-2";
        badge.innerHTML = `<i class="bi bi-check-circle-fill me-2"></i> Hire`;
        decisionDesc.innerText = "You are a strong candidate! Keep up the good work.";
        decPanel.style.borderLeft = "5px solid var(--success)";
        decPanel.style.background = "rgba(16, 185, 129, 0.05)";
    } else {
        badge.className = "badge bg-warning p-2 px-3 fs-5 my-2";
        badge.innerHTML = `<i class="bi bi-exclamation-triangle-fill me-2"></i> Under Review`;
        decisionDesc.innerText = "Requires revision. Practice the highlighted weaknesses.";
        decPanel.style.borderLeft = "5px solid var(--warning)";
        decPanel.style.background = "rgba(245, 158, 11, 0.05)";
    }

    // Slider values
    document.getElementById("breakdown-tech-pct").innerText = report.technical_score + "%";
    document.getElementById("breakdown-tech-bar").style.width = report.technical_score + "%";

    document.getElementById("breakdown-comm-pct").innerText = report.communication_score + "%";
    document.getElementById("breakdown-comm-bar").style.width = report.communication_score + "%";

    document.getElementById("breakdown-conf-pct").innerText = report.confidence_score + "%";
    document.getElementById("breakdown-conf-bar").style.width = report.confidence_score + "%";

    // Problem solving fallback
    const psScore = report.overall_score;
    document.getElementById("breakdown-prob-pct").innerText = psScore + "%";
    document.getElementById("breakdown-prob-bar").style.width = psScore + "%";

    // Grammar score mapping
    const gramScore = report.communication_score - 2;
    document.getElementById("breakdown-gram-pct").innerText = gramScore + "%";
    document.getElementById("breakdown-gram-bar").style.width = gramScore + "%";

    // Lists of strengths and improvements
    const strengths = document.getElementById("report-strengths-list");
    strengths.innerHTML = "";
    const listStrengths = report.evaluation_summary.strengths || [];
    listStrengths.forEach(str => {
        strengths.innerHTML += `
            <div class="strength-item mb-2 d-flex align-items-start gap-1">
                <i class="bi bi-check-circle-fill text-success mt-0.5"></i>
                <span class="text-white small">${str}</span>
            </div>
        `;
    });

    const weaknesses = document.getElementById("report-weaknesses-list");
    weaknesses.innerHTML = "";
    const listWeaknesses = report.evaluation_summary.weaknesses || [];
    listWeaknesses.forEach(w => {
        weaknesses.innerHTML += `
            <div class="weakness-item mb-2 d-flex align-items-start gap-1">
                <i class="bi bi-exclamation-triangle-fill text-warning mt-0.5"></i>
                <span class="text-white small">${w}</span>
            </div>
        `;
    });

    const nextSteps = document.getElementById("report-nextsteps-list");
    if (nextSteps) {
        nextSteps.innerHTML = "";
        const listSuggestions = report.evaluation_summary.suggestions || [];
        listSuggestions.forEach(s => {
            nextSteps.innerHTML += `
                <div class="nextstep-item mb-2 d-flex align-items-start gap-1">
                    <i class="bi bi-play-circle text-primary mt-0.5"></i>
                    <span class="text-white small">${s}</span>
                </div>
            `;
        });
    }

    // Redirect to report subtab
    switchInterviewSubTab("report");
}

async function loadInterviewHistoryTable() {
    if (!accessToken) return;
    try {
        const res = await fetch(`${API_ROOT}/interview/sessions`, {
            headers: { "Authorization": `Bearer ${accessToken}` }
        });
        if (res.ok) {
            const sessions = await res.json();
            const tbody = document.getElementById("sim-history-tbody");
            tbody.innerHTML = "";

            const completed = sessions.filter(s => s.status === "COMPLETED");
            if (completed.length === 0) {
                tbody.innerHTML = `<tr><td colspan="6" class="text-center text-secondary py-4">No completed mock sessions found.</td></tr>`;
                return;
            }

            completed.forEach(sess => {
                const tr = document.createElement("tr");
                let reportScore = sess.report ? sess.report.overall_score + "%" : "N/A";
                let reportButton = sess.report ? `<button class="btn btn-sm btn-outline-info" onclick='openOldReport(${JSON.stringify(sess.report)})'><i class="bi bi-file-earmark-bar-graph"></i> View</button>` : "N/A";

                tr.innerHTML = `
                    <td>${new Date(sess.started_at).toLocaleDateString()}</td>
                    <td><span class="badge bg-primary">${sess.type}</span></td>
                    <td>Medium</td>
                    <td>30 min</td>
                    <td class="fw-bold text-success">${reportScore}</td>
                    <td>${reportButton}</td>
                `;
                tbody.appendChild(tr);
            });
        }
    } catch (e) {
        console.error("History failed to load: ", e);
    }
}

function openOldReport(report) {
    renderFinalEvaluationReport(report);
}

function filterHistoryLogs() {
    const searchVal = document.getElementById("sim-history-search").value.toLowerCase();
    const filterVal = document.getElementById("sim-history-filter").value;

    const rows = document.querySelectorAll("#sim-history-tbody tr");
    rows.forEach(row => {
        if (row.cells.length < 2) return;
        const typeCol = row.cells[1]?.innerText || "";
        const dateCol = row.cells[0]?.innerText || "";

        const matchesSearch = dateCol.toLowerCase().includes(searchVal) || typeCol.toLowerCase().includes(searchVal);
        const matchesFilter = filterVal === "ALL" || typeCol.toUpperCase() === filterVal;

        if (matchesSearch && matchesFilter) {
            row.classList.remove("d-none");
        } else {
            row.classList.add("d-none");
        }
    });
}

function initiatePanelSimulation() {
    let currentActive = 1;
    // Clear any previous interval if stored on a global/local context
    if (window.panelSimulationInterval) clearInterval(window.panelSimulationInterval);

    window.panelSimulationInterval = setInterval(() => {
        if (activeInterviewSubTab !== "panel") {
            clearInterval(window.panelSimulationInterval);
            return;
        }
        document.querySelectorAll(".panelist-card").forEach(c => {
            c.className = "panelist-card waiting p-2";
            c.querySelector(".panelist-badge").className = "panelist-badge text-secondary";
            c.querySelector(".panelist-badge").innerHTML = `<i class="bi bi-hourglass-split"></i> Waiting`;
        });

        const activeCard = document.getElementById(`panelist-${currentActive}`);
        if (activeCard) {
            activeCard.className = "panelist-card speaking p-2";
            activeCard.querySelector(".panelist-badge").className = "panelist-badge text-success";
            activeCard.querySelector(".panelist-badge").innerHTML = `<i class="bi bi-mic-fill"></i> Active`;

            // Set header label
            const rolesMap = {
                1: "HR Manager (Sarah Jenkins) is speaking...",
                2: "Technical Lead (David Chen) is speaking...",
                3: "Engineering Manager (Marcus Brody) is speaking...",
                4: "Project Manager (Elena Rostova) is speaking..."
            };
            const header = document.getElementById("panel-speaking-header");
            if (header) header.innerText = rolesMap[currentActive];

            // Set listeners labels
            const nextIdx = (currentActive % 4) + 1;
            const listenerCard = document.getElementById(`panelist-${nextIdx}`);
            if (listenerCard) {
                listenerCard.className = "panelist-card listening p-2";
                listenerCard.querySelector(".panelist-badge").className = "panelist-badge text-primary";
                listenerCard.querySelector(".panelist-badge").innerHTML = `<i class="bi bi-earbuds"></i> Listening`;
            }
        }
        currentActive = (currentActive % 4) + 1;
    }, 5000);
}

function sendPanelMockResponse() {
    const input = document.getElementById("panel-user-input");
    const chat = document.getElementById("panel-chat-pane");
    if (!input.value.trim()) return;

    chat.innerHTML += `
        <div class="mb-3 text-end text-white">
            <strong>You:</strong> ${input.value}
        </div>
    `;
    input.value = "";
    chat.scrollTop = chat.scrollHeight;

    setTimeout(() => {
        chat.innerHTML += `
            <div class="mb-3 text-info">
                <strong>David Chen (Technical Lead):</strong> That makes perfect sense. Can you build on that by describing how indexing improves query operations?
            </div>
        `;
        chat.scrollTop = chat.scrollHeight;
    }, 1500);
}

function loadLiveAnalysisData() {
    const canvas = document.getElementById("analysisRadarChart");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (analysisRadarChart) analysisRadarChart.destroy();

    analysisRadarChart = new Chart(ctx, {
        type: 'radar',
        data: {
            labels: ['Technical Accuracy', 'Confidence', 'Grammar', 'Problem Solving', 'Communication', 'Logical flow'],
            datasets: [{
                label: 'Cognitive Balance %',
                data: [82, 78, 76, 80, 74, 84],
                borderColor: '#10b981',
                backgroundColor: 'rgba(16, 185, 129, 0.15)',
                borderWidth: 2,
                pointBackgroundColor: '#10b981'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                r: {
                    angleLines: { color: 'rgba(255,255,255,0.08)' },
                    grid: { color: 'rgba(255,255,255,0.08)' },
                    pointLabels: { color: '#94a3b8', font: { size: 10 } },
                    ticks: { display: false }
                }
            }
        }
    });
}

function loadPerformanceAnalytics() {
    const ctxScore = document.getElementById("growthScoreChart").getContext("2d");
    if (growthScoreChart) growthScoreChart.destroy();
    growthScoreChart = new Chart(ctxScore, {
        type: 'line',
        data: {
            labels: ['Session 1', 'Session 2', 'Session 3', 'Session 4', 'Session 5', 'Session 6'],
            datasets: [{
                data: [65, 70, 72, 75, 78, 84],
                borderColor: '#6366f1',
                backgroundColor: 'rgba(99, 102, 241, 0.1)',
                borderWidth: 3,
                tension: 0.4,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { min: 0, max: 100, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } },
                x: { grid: { display: false }, ticks: { color: '#94a3b8' } }
            }
        }
    });

    const ctxConf = document.getElementById("confidenceProgressionChart").getContext("2d");
    if (confidenceProgressionChart) confidenceProgressionChart.destroy();
    confidenceProgressionChart = new Chart(ctxConf, {
        type: 'line',
        data: {
            labels: ['Session 1', 'Session 2', 'Session 3', 'Session 4', 'Session 5', 'Session 6'],
            datasets: [{
                data: [60, 68, 70, 74, 75, 82],
                borderColor: '#10b981',
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                borderWidth: 3,
                tension: 0.4,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { min: 0, max: 100, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } },
                x: { grid: { display: false }, ticks: { color: '#94a3b8' } }
            }
        }
    });
}

function downloadSimulationReport() {
    let reportText = `# AI MOCK INTERVIEW SIMULATOR REPORT\n`;
    reportText += `==========================================\n`;
    reportText += `Candidate: Bansari Moradiya (MCA Student)\n`;
    reportText += `Date: ${new Date().toLocaleDateString()}\n`;
    reportText += `==========================================\n\n`;

    const overall = document.getElementById("report-overall-score")?.innerText || "84%";
    const tech = document.getElementById("breakdown-tech-pct")?.innerText || "86%";
    const comm = document.getElementById("breakdown-comm-pct")?.innerText || "78%";
    const conf = document.getElementById("breakdown-conf-pct")?.innerText || "82%";
    const prob = document.getElementById("breakdown-prob-pct")?.innerText || "85%";
    const gram = document.getElementById("breakdown-gram-pct")?.innerText || "76%";
    const decision = document.getElementById("report-decision-badge")?.innerText.trim() || "Hire";

    reportText += `## PERFORMANCE SCORES\n`;
    reportText += `- Overall Score: ${overall}\n`;
    reportText += `- Technical Accuracy: ${tech}\n`;
    reportText += `- Communication Pacing: ${comm}\n`;
    reportText += `- Confidence Level: ${conf}\n`;
    reportText += `- Problem Solving Logic: ${prob}\n`;
    reportText += `- Grammar & Vocabulary: ${gram}\n`;
    reportText += `- Decision: ${decision}\n\n`;

    reportText += `## KEY STRENGTHS\n`;
    const strengths = document.querySelectorAll("#report-strengths-list .strength-item, #report-strengths-list div");
    if (strengths.length > 0) {
        strengths.forEach((s) => {
            const txt = s.innerText.trim();
            if (txt) reportText += `- ${txt}\n`;
        });
    } else {
        reportText += `- Strong background understanding and MVC articulation\n`;
        reportText += `- Exceptional responsiveness during coding rounds\n`;
    }
    reportText += `\n`;

    reportText += `## AREAS TO IMPROVE\n`;
    const weaknesses = document.querySelectorAll("#report-weaknesses-list .weakness-item, #report-weaknesses-list div");
    if (weaknesses.length > 0) {
        weaknesses.forEach((w) => {
            const txt = w.innerText.trim();
            if (txt) reportText += `- ${txt}\n`;
        });
    } else {
        reportText += `- Try to expand answers with more concrete production examples\n`;
    }
    reportText += `\n`;

    reportText += `## NEXT STEPS\n`;
    const nextSteps = document.querySelectorAll("#report-nextsteps-list .nextstep-item, #report-nextsteps-list div");
    if (nextSteps.length > 0) {
        nextSteps.forEach((s) => {
            const txt = s.innerText.trim();
            if (txt) reportText += `- ${txt}\n`;
        });
    } else {
        reportText += `- Practice explaining concurrency tradeoffs\n`;
    }
    reportText += `\n`;

    reportText += `## INTERVIEW CONVERSATION TRANSCRIPT\n`;
    reportText += `------------------------------------------\n`;
    if (chatTranscript && chatTranscript.length > 0) {
        chatTranscript.forEach(item => {
            const role = item.sender === "INTERVIEWER" ? "Interviewer" : "Candidate (Bansari)";
            reportText += `${role}: ${item.text}\n\n`;
        });
    } else {
        reportText += `[No active conversation logged during this session]\n`;
    }
    reportText += `------------------------------------------\n`;

    // Trigger download
    const blob = new Blob([reportText], { type: "text/markdown;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", `mock_interview_report_Bansari_${new Date().toISOString().split('T')[0]}.md`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
    } catch (e) { }
}

function downloadPDFReport() {
    const reportElement = document.getElementById("interview-subtab-report");
    if (!reportElement) {
        alert("Report element not found");
        return;
    }

    // Hide buttons temporarily during PDF generation to keep it clean
    const actionWrapper = reportElement.querySelector(".d-flex.justify-content-between.align-items-center.mb-4");
    let btnGroup = null;
    if (actionWrapper) {
        btnGroup = actionWrapper.querySelector(".d-flex.gap-2");
        if (btnGroup) {
            btnGroup.style.display = "none";
        }
    }

    // Configure PDF options
    const opt = {
        margin: [10, 10, 10, 10],
        filename: `mock_interview_report_Bansari_${new Date().toISOString().split('T')[0]}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: '#0f172a' },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    // Generate PDF
    html2pdf().set(opt).from(reportElement).save().then(() => {
        // Restore buttons display
        if (btnGroup) {
            btnGroup.style.display = "flex";
        }
    }).catch(err => {
        console.error("PDF generation failed:", err);
        if (btnGroup) {
            btnGroup.style.display = "flex";
        }
        alert("Failed to download PDF. Please try again.");
    });
}

// ==========================================================================
// Portfolio Guidance Functions
// ==========================================================================

async function loadPortfolioGuidance() {
    const container = document.getElementById("portfolio-projects-container");
    if (!container) return;

    // Show loading state
    container.innerHTML = `
        <div class="text-center py-5">
            <div class="spinner-border text-primary" role="status"></div>
            <p class="text-secondary mt-2">Loading portfolio projects...</p>
        </div>
    `;

    try {
        const response = await fetch(`${API_ROOT}/interview/portfolio`, {
            headers: { "Authorization": `Bearer ${accessToken}` }
        });

        if (!response.ok) throw new Error("Failed to load projects");
        const projects = await response.json();

        if (projects.length === 0) {
            container.innerHTML = `
                <div class="text-center py-5 text-secondary">
                    <i class="bi bi-folder2-open fs-1 mb-2 d-block"></i>
                    <p>No projects evaluated yet. Submit your first project on the left!</p>
                </div>
            `;
            updatePortfolioReadinessGauge(0);
            return;
        }

        let totalScore = 0;
        let html = "";

        projects.forEach(project => {
            totalScore += project.score;
            const feedback = project.feedback || {};
            const questions = feedback.key_questions || [];
            const starPoints = feedback.star_points || [];
            const improvements = feedback.improvements || [];

            html += `
                <div class="glass-panel p-4 mb-3 position-relative">
                    <button class="btn btn-sm btn-outline-danger border-0 position-absolute" 
                            style="top: 12px; right: 12px; z-index: 10;" 
                            onclick="deletePortfolioProject('${project.id}')" 
                            title="Delete Project">
                        <i class="bi bi-trash3-fill"></i>
                    </button>
                    
                    <div class="d-flex justify-content-between align-items-start mb-2 pe-4">
                        <div>
                            <h5 class="fw-bold m-0 text-white">${escapeHtml(project.title)}</h5>
                            <small class="text-info">${escapeHtml(project.tech_stack)}</small>
                        </div>
                        <span class="badge ${project.score >= 80 ? 'bg-success' : 'bg-warning'} fs-6">${project.score.toFixed(0)}%</span>
                    </div>

                    <p class="text-secondary small mb-3">${escapeHtml(project.description)}</p>
                    
                    ${project.github_url ? `
                    <div class="mb-3">
                        <a href="${escapeHtml(project.github_url)}" target="_blank" class="text-xs text-primary text-decoration-none">
                            <i class="bi bi-github me-1"></i> View Repository
                        </a>
                    </div>` : ''}

                    <div class="accordion" id="accordion-${project.id}">
                        <!-- Predicted Questions -->
                        <div class="accordion-item bg-transparent border-secondary border-opacity-10">
                            <h2 class="accordion-header">
                                <button class="accordion-button collapsed bg-transparent text-white text-sm" type="button" data-bs-toggle="collapse" data-bs-target="#collapse-questions-${project.id}">
                                    <i class="bi bi-question-circle text-primary me-2"></i> Predicted Interview Questions
                                </button>
                            </h2>
                            <div id="collapse-questions-${project.id}" class="accordion-collapse collapse" data-bs-parent="#accordion-${project.id}">
                                <div class="accordion-body text-secondary small">
                                    <ul class="ps-3 mb-0">
                                        ${questions.map(q => `<li class="mb-2">${escapeHtml(q)}</li>`).join('')}
                                    </ul>
                                </div>
                            </div>
                        </div>

                        <!-- STAR Method Points -->
                        <div class="accordion-item bg-transparent border-secondary border-opacity-10">
                            <h2 class="accordion-header">
                                <button class="accordion-button collapsed bg-transparent text-white text-sm" type="button" data-bs-toggle="collapse" data-bs-target="#collapse-star-${project.id}">
                                    <i class="bi bi-star text-warning me-2"></i> STAR Method Talking Points
                                </button>
                            </h2>
                            <div id="collapse-star-${project.id}" class="accordion-collapse collapse" data-bs-parent="#accordion-${project.id}">
                                <div class="accordion-body text-secondary small">
                                    <ul class="ps-3 mb-0">
                                        ${starPoints.map(p => `<li class="mb-2">${escapeHtml(p)}</li>`).join('')}
                                    </ul>
                                </div>
                            </div>
                        </div>

                        <!-- Improvements -->
                        <div class="accordion-item bg-transparent border-0">
                            <h2 class="accordion-header">
                                <button class="accordion-button collapsed bg-transparent text-white text-sm" type="button" data-bs-toggle="collapse" data-bs-target="#collapse-improve-${project.id}">
                                    <i class="bi bi-tools text-success me-2"></i> Recommended Upgrades
                                </button>
                            </h2>
                            <div id="collapse-improve-${project.id}" class="accordion-collapse collapse" data-bs-parent="#accordion-${project.id}">
                                <div class="accordion-body text-secondary small">
                                    <ul class="ps-3 mb-0">
                                        ${improvements.map(i => `<li class="mb-2">${escapeHtml(i)}</li>`).join('')}
                                    </ul>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;

        // Calculate and update average score
        const averageScore = totalScore / projects.length;
        updatePortfolioReadinessGauge(averageScore);

    } catch (err) {
        console.error(err);
        container.innerHTML = `
            <div class="text-center py-5 text-danger">
                <i class="bi bi-exclamation-triangle fs-1 mb-2 d-block"></i>
                <p>Failed to load portfolio projects. Please try again later.</p>
            </div>
        `;
    }
}

function updatePortfolioReadinessGauge(score) {
    const gauge = document.getElementById("portfolio-readiness-gauge");
    const valText = document.getElementById("portfolio-readiness-value");
    const feedbackText = document.getElementById("portfolio-readiness-feedback");
    if (!gauge || !valText || !feedbackText) return;

    valText.innerText = `${score.toFixed(0)}%`;

    // SVG dasharray/dashoffset mapping. R=58, perimeter = 2 * PI * 58 = 364.4.
    const maxOffset = 364;
    const offset = maxOffset - (score / 100) * maxOffset;
    gauge.style.strokeDashoffset = offset;

    // Set textual rating description
    if (score === 0) {
        feedbackText.innerText = "Add a project below to evaluate your portfolio depth.";
        feedbackText.className = "text-secondary small";
    } else if (score < 60) {
        feedbackText.innerText = "Beginner portfolio. Needs architectural improvements and documentation.";
        feedbackText.className = "text-danger small fw-bold";
    } else if (score < 80) {
        feedbackText.innerText = "Good portfolio. Optimize project descriptions and implement standard patterns.";
        feedbackText.className = "text-warning small fw-bold";
    } else {
        feedbackText.innerText = "Excellent portfolio! High technical depth and strong interview readiness.";
        feedbackText.className = "text-success small fw-bold";
    }
}

async function submitPortfolioProject(event) {
    event.preventDefault();

    const titleEl = document.getElementById("portfolio-title");
    const techEl = document.getElementById("portfolio-tech");
    const descEl = document.getElementById("portfolio-desc");
    const githubEl = document.getElementById("portfolio-github");
    const submitBtn = document.getElementById("portfolio-submit-btn");

    if (!titleEl || !techEl || !descEl || !submitBtn) return;

    // Disable button & show spinner
    const originalText = submitBtn.innerText;
    submitBtn.disabled = true;
    submitBtn.innerHTML = `
        <span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
        AI is evaluating project depth...
    `;

    const payload = {
        title: titleEl.value,
        tech_stack: techEl.value,
        description: descEl.value,
        github_url: githubEl ? githubEl.value || null : null
    };

    try {
        const response = await fetch(`${API_ROOT}/interview/portfolio`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${accessToken}`
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) throw new Error("Failed to submit project");

        // Clear form
        titleEl.value = "";
        techEl.value = "";
        descEl.value = "";
        if (githubEl) githubEl.value = "";

        // Reload guidance
        await loadPortfolioGuidance();

    } catch (err) {
        console.error(err);
        alert("Failed to evaluate portfolio project. Please ensure Gemini API key is configured and try again.");
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerText = originalText;
    }
}

async function deletePortfolioProject(projectId) {
    if (!confirm("Are you sure you want to remove this project from your interview prep portfolio?")) return;

    try {
        const response = await fetch(`${API_ROOT}/interview/portfolio/${projectId}`, {
            method: "DELETE",
            headers: { "Authorization": `Bearer ${accessToken}` }
        });

        if (!response.ok) throw new Error("Failed to delete project");

        await loadPortfolioGuidance();
    } catch (err) {
        console.error(err);
        alert("Failed to delete project.");
    }
}

function escapeHtml(text) {
    if (!text) return "";
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, function(m) { return map[m]; });
}


// ==========================================
// 8. Portfolio Guidance Tab Functions
// ==========================================
function initPortfolioGuidanceTab() {
    // 1. Load Profile URLs
    const linkedinUrl = localStorage.getItem("pg_url_linkedin") || "";
    const githubUrl = localStorage.getItem("pg_url_github") || "";
    const portfolioUrl = localStorage.getItem("pg_url_portfolio") || "";
    const resumeUrl = localStorage.getItem("pg_url_resume") || "";

    const linkedinEl = document.getElementById("pg-url-linkedin");
    const githubEl = document.getElementById("pg-url-github");
    const resumeEl = document.getElementById("pg-url-resume");
    if (linkedinEl) linkedinEl.value = linkedinUrl;
    if (githubEl) githubEl.value = githubUrl;
    if (resumeEl) resumeEl.value = resumeUrl;

    // 2. Load Target Career
    const career = localStorage.getItem("pg_target_career") || "Full Stack Developer";
    const careerEl = document.getElementById("pg-target-career");
    if (careerEl) careerEl.value = career;

    // 3. Load Checklist Statuses
    const checklistItems = [
        "linkedin", "github", "portfolio", "resume", "projects", "certifications", "achievements", "profile"
    ];
    checklistItems.forEach(item => {
        const val = localStorage.getItem(`pg_chk_${item}`) || "Needs Improvement";
        const el = document.getElementById(`chk-${item}`);
        if (el) el.value = val;
    });

    // 4. Load Showcase details
    const showName = localStorage.getItem("pg_proj_name") || "";
    const showTech = localStorage.getItem("pg_proj_tech") || "";
    const showProblem = localStorage.getItem("pg_proj_problem") || "";
    const showFeatures = localStorage.getItem("pg_proj_features") || "";
    const showGithub = localStorage.getItem("pg_proj_github") || "";
    const showDemo = localStorage.getItem("pg_proj_demo") || "";
    const showRole = localStorage.getItem("pg_proj_role") || "";

    if (document.getElementById("pg-proj-name")) document.getElementById("pg-proj-name").value = showName;
    if (document.getElementById("pg-proj-tech")) document.getElementById("pg-proj-tech").value = showTech;
    if (document.getElementById("pg-proj-problem")) document.getElementById("pg-proj-problem").value = showProblem;
    if (document.getElementById("pg-proj-features")) document.getElementById("pg-proj-features").value = showFeatures;
    if (document.getElementById("pg-proj-github")) document.getElementById("pg-proj-github").value = showGithub;
    if (document.getElementById("pg-proj-demo")) document.getElementById("pg-proj-demo").value = showDemo;
    if (document.getElementById("pg-proj-role")) document.getElementById("pg-proj-role").value = showRole;

    // 5. Load AI Analyzer fields
    const analyzerExp = localStorage.getItem("pg_an_experience") || "Beginner";
    const analyzerSkills = localStorage.getItem("pg_an_skills") || "";
    const analyzerProjectsCount = localStorage.getItem("pg_an_projects_count") || "1";

    if (document.getElementById("an-experience")) document.getElementById("an-experience").value = analyzerExp;
    if (document.getElementById("an-skills")) document.getElementById("an-skills").value = analyzerSkills;
    if (document.getElementById("an-projects-count")) document.getElementById("an-projects-count").value = analyzerProjectsCount;

    // 6. Draw dynamic content
    onPortfolioCareerChange();
    onChecklistChange();
    evaluateShowcaseProject();
}

function onPortfolioCareerChange() {
    const career = document.getElementById("pg-target-career").value;
    localStorage.setItem("pg_target_career", career);

    // Map template advice according to selected career
    const advice = {
        "AI Engineer": {
            home: "Tagline: 'AI Engineer building end-to-end Machine Learning pipelines and LLM systems'. Highlight HuggingFace, Kaggle profiles.",
            about: "Focus on mathematical background, Deep Learning architectures, NLP/CV, and prompt engineering skills.",
            skills: "Languages: Python, C++. Frameworks: PyTorch, TensorFlow, LangChain, HuggingFace, FastAPI. Tools: Docker, CUDA.",
            projects: "Build 3 ML repositories: e.g., custom transformer models, RAG vector database architectures, or training/fine-tuning scripts.",
            intern: "Highlight ML research assistantships, open source ML tool library contributions, or AI agent development.",
            certs: "DeepLearning.AI TensorFlow Developer, Google Cloud Machine Learning Engineer, AWS Certified Machine Learning.",
            achieve: "Kaggle competition tier status, ML research paper publications, or hackathon AI tracks winner badges.",
            resume: "Feature Github ML project repos. Ensure skills section prioritizes model metrics and engineering pipelines.",
            contact: "Provide professional Github, email channels, and link to HuggingFace space demos."
        },
        "Full Stack Developer": {
            home: "Tagline: 'Full Stack Engineer designing scalable web platforms and responsive interfaces'. Link live project demos.",
            about: "Detail your passion for robust backend architectures and sleek, interactive client-side browser user interfaces.",
            skills: "Languages: Javascript/Typescript, Python, Go. Stack: React, Next.js, Node.js, Express, FastAPI. Databases: SQL, MongoDB.",
            projects: "Add 3-5 full-stack apps: e.g. e-commerce platform with stripe integrations, real-time socket chat, or dashboard utilities.",
            intern: "Showcase startup full-stack engineer experience, client freelancing, or deployment pipeline setups.",
            certs: "AWS Certified Developer, Certified Kubernetes Administrator (CKA), Meta Front-End/Back-End certificates.",
            achieve: "Open source web framework pull-requests merged, hackathon grand prize wins, or top LeetCode solver ratings.",
            resume: "List live application URLs. Quantify contributions: e.g., 'reduced API latency by 35% using Redis caching'.",
            contact: "Provide active GitHub link, LinkedIn page link, and professional email contact form."
        },
        "Python Developer": {
            home: "Tagline: 'Python Specialist specializing in backend architectures, microservices, and web scraping'.",
            about: "Focus on clean coding, PEP 8 standards, server optimization, and automated scraping/testing scripts.",
            skills: "Languages: Python. Frameworks: Django, Flask, FastAPI, Celery, Pytest. DBs: PostgreSQL, Redis. Tools: Docker.",
            projects: "Highlight backend API engines, automation scripts, task-queue implementations, and database parsers.",
            intern: "Showcase back-end software engineering contributions, database migration scripts, or microservices engineering.",
            certs: "PCEP (Certified Associate Python Programmer), PCAP, AWS Cloud Practitioner.",
            achieve: "Merged PRs to large Python codebases, CLI tool package published to PyPI, or high ranks in competitive programming.",
            resume: "Emphasize optimization metrics, unit testing coverage (%), database query tuning achievements.",
            contact: "Include professional email, GitHub portfolio, and developer technical blogs."
        },
        "Data Scientist": {
            home: "Tagline: 'Data Scientist leveraging predictive analytics and statistics to extract business value'. Link Tableau/Streamlit dashboards.",
            about: "Detail statistical expertise, data exploration pipelines, visualization methodologies, and predictive modeling.",
            skills: "Languages: Python, R, SQL. Stack: Pandas, NumPy, Scikit-Learn, Statsmodels, Tableau, PowerBI. Cloud: Snowflake, BigQuery.",
            projects: "Detail predictive regression engines, customer segmentation clustering, and exploratory data analysis (EDA) notebooks.",
            intern: "Showcase data analyst positions, corporate analytics projects, or business forecasting reporting systems.",
            certs: "Google Professional Data Database Analyst, IBM Data Science Professional, Microsoft Certified PowerBI Associate.",
            achieve: "Kaggle competition finishes, academic thesis research milestones, or data dashboard contest wins.",
            resume: "Quantify impact: e.g., 'Designed customer classification model that increased target campaign response by 20%'.",
            contact: "Provide link to GitHub notebooks, Tableau Public dashboard space, and LinkedIn."
        },
        "Data Analyst": {
            home: "Tagline: 'Data Analyst turning raw metrics into actionable business intelligence dashboards'. Link Tableau/PowerBI portfolios.",
            about: "Describe a strong focus on data cleaning, ETL processes, dashboard design, and stakeholder metrics delivery.",
            skills: "Skills: SQL, Excel (Advanced), Python (Pandas/Matplotlib), Tableau, PowerBI, Google Looker Studio.",
            projects: "Include 3 dashboards: e.g. sales performance visualization, customer retention report, or marketing analytics spaces.",
            intern: "Showcase business intelligence internships, database auditing, or reporting automation scripts.",
            certs: "Google Data Analytics Professional, Microsoft Certified: Data Analyst Associate, Tableau Desktop Certified Associate.",
            achieve: "Automated legacy Excel report workflows saving 10+ manual hours weekly, or corporate data hackathon wins.",
            resume: "Highlight dashboard user counts, database query size scale, and manual work hours saved through ETL scripts.",
            contact: "Link your Tableau Public profile, GitHub repository containing SQL scripts, and LinkedIn."
        },
        "Java Developer": {
            home: "Tagline: 'Java Developer designing scalable enterprise architectures and high-performance backend systems'.",
            about: "Detail object-oriented software engineering principles, enterprise Spring Boot architectures, and clean Java patterns.",
            skills: "Stack: Java (8/11/17), Spring Boot, Hibernate, Maven/Gradle, JUnit, PostgreSQL, Docker, AWS, Microservices.",
            projects: "Include Spring Boot REST APIs, multithreaded order-processing engines, or enterprise bank simulator microservices.",
            intern: "Enterprise software development roles, legacy code migrations, or database integration projects.",
            certs: "Oracle Certified Professional (OCP) Java SE Developer, Spring Professional Certification, AWS Certified Developer.",
            achieve: "Built optimized multithreaded backend tools, open-source Java framework contributions, or algorithm contests.",
            resume: "Focus on concurrency architectures, database connection pool tuning, and unit testing coverage metrics.",
            contact: "Provide GitHub, LinkedIn link, and email."
        },
        "Web Developer": {
            home: "Tagline: 'Frontend & UI Developer crafting immersive web interfaces and fluid client side experiences'.",
            about: "Emphasize responsive web layout frameworks, CSS custom animations, accessibility standards, and web speed optimizations.",
            skills: "Languages: HTML, CSS, JavaScript. Frameworks: React, Vue, TailwindCSS, Bootstrap, Webpack, Git.",
            projects: "Include responsive landing spaces, component portfolios, custom UI utility libraries, or CSS art galleries.",
            intern: "Showcase digital agency developer experience, client freelance contracts, or UI template designs.",
            certs: "W3C Front-End Web Developer, Meta Front-End Developer Professional Certificate, freeCodeCamp UI certifications.",
            achieve: "Published customized npm UI component libraries, designed custom theme templates with high download counts.",
            resume: "Highlight Google Lighthouse scores (%), performance loading speeds, and responsive design metrics.",
            contact: "Provide links to codepen snippets, personal portfolio space, and live deployment links."
        },
        "Software Engineer": {
            home: "Tagline: 'Software Engineer focusing on system design, robust algorithms, and scalable microservices'.",
            about: "Detail strong background in data structures & algorithms, architectural style tradeoffs, and testing patterns.",
            skills: "Languages: C++, Python, Java, Go. Systems: Linux, Docker, Git, CI/CD, Kubernetes, Redis, SQL.",
            projects: "Design custom compilers, distributed key-value stores, customized testing tools, or system architecture pipelines.",
            intern: "Showcase software engineering internships, core infrastructure contributions, or test suite scaling setups.",
            certs: "AWS Certified Solutions Architect, Associate Software Developer certifications, Scrum Master badges.",
            achieve: "Ranked in top competitive programming challenges, major performance optimizations to backend engines.",
            resume: "Highlight algortihmic complexity reductions (e.g. O(N^2) to O(N log N)), test coverage (%), and system architecture graphs.",
            contact: "Link GitHub repository, LeetCode profile, and technical project blogs."
        },
        "Other": {
            home: "Tagline: 'Technical Specialist solving custom operational problems through code and technology'.",
            about: "Highlight your unique cross-disciplinary approach to solving problems, automation scripts, and stack agility.",
            skills: "Tools: Python, SQL, Git, Shell Scripting, Docker, Custom stack tools, Cloud configurations.",
            projects: "Include automation tools, data conversion utilities, scripting guides, or cloud deployment templates.",
            intern: "Highlight technical support setups, QA automated testing, or scripting operations tasks.",
            certs: "AWS Cloud Practitioner, Linux Professional Institute Certification, Google Cloud Associate Cloud Engineer.",
            achieve: "Created custom automation scripts saving team hours, resolved legacy migration bugs, or system automation wins.",
            resume: "Showcase problem statement, tool choice justifications, and time-saving automation metrics.",
            contact: "Link GitHub, LinkedIn profile page, and active email channel."
        }
    };

    const targetAdvice = advice[career] || advice["Other"];
    
    // Set text in accordions
    document.getElementById("advice-home").innerText = targetAdvice.home;
    document.getElementById("advice-about").innerText = targetAdvice.about;
    document.getElementById("advice-skills").innerText = targetAdvice.skills;
    document.getElementById("advice-projects").innerText = targetAdvice.projects;
    document.getElementById("advice-intern").innerText = targetAdvice.intern;
    document.getElementById("advice-certs").innerText = targetAdvice.certs;
    document.getElementById("advice-achieve").innerText = targetAdvice.achieve;
    document.getElementById("advice-resume").innerText = targetAdvice.resume;
    document.getElementById("advice-contact").innerText = targetAdvice.contact;
}

function onChecklistChange() {
    const checklistItems = [
        "linkedin", "github", "portfolio", "resume", "projects", "certifications", "achievements", "profile"
    ];

    let completeCount = 0;
    let totalScore = 0;

    checklistItems.forEach(item => {
        const selectEl = document.getElementById(`chk-${item}`);
        if (!selectEl) return;
        const val = selectEl.value;
        localStorage.setItem(`pg_chk_${item}`, val);

        if (val === "Complete") {
            completeCount++;
            totalScore += 100;
        } else if (val === "In Progress") {
            totalScore += 70;
        } else {
            totalScore += 40; // Needs Improvement
        }
    });

    const completionPct = Math.round((completeCount / checklistItems.length) * 100);
    document.getElementById("pg-checklist-summary").innerText = `${completeCount} / ${checklistItems.length} Completed`;
    document.getElementById("pg-checklist-pct").innerText = `${completionPct}%`;
    document.getElementById("pg-checklist-progress").style.width = `${completionPct}%`;

    // Recalculate breakdown values
    updatepgReadinessScores();
}

function updatepgReadinessScores() {
    const scoreMap = {
        "Complete": 100,
        "In Progress": 70,
        "Needs Improvement": 40
    };

    const chkLinkedin = document.getElementById("chk-linkedin")?.value || "Needs Improvement";
    const chkGithub = document.getElementById("chk-github")?.value || "Needs Improvement";
    const chkPortfolio = document.getElementById("chk-portfolio")?.value || "Needs Improvement";
    const chkResume = document.getElementById("chk-resume")?.value || "Needs Improvement";
    const chkProjects = document.getElementById("chk-projects")?.value || "Needs Improvement";

    const linkedinScore = scoreMap[chkLinkedin];
    const githubScore = scoreMap[chkGithub];
    const portfolioScore = scoreMap[chkPortfolio];
    const resumeScore = scoreMap[chkResume];
    const projectsScore = scoreMap[chkProjects];

    document.getElementById("pg-breakdown-linkedin").innerText = `${linkedinScore}/100`;
    document.getElementById("pg-bar-linkedin").style.width = `${linkedinScore}%`;

    document.getElementById("pg-breakdown-github").innerText = `${githubScore}/100`;
    document.getElementById("pg-bar-github").style.width = `${githubScore}%`;

    document.getElementById("pg-breakdown-portfolio").innerText = `${portfolioScore}/100`;
    document.getElementById("pg-bar-portfolio").style.width = `${portfolioScore}%`;

    document.getElementById("pg-breakdown-resume").innerText = `${resumeScore}/100`;
    document.getElementById("pg-bar-resume").style.width = `${resumeScore}%`;

    document.getElementById("pg-breakdown-projects").innerText = `${projectsScore}/100`;
    document.getElementById("pg-bar-projects").style.width = `${projectsScore}%`;

    // Average Score calculation
    const avgScore = Math.round((linkedinScore + githubScore + portfolioScore + resumeScore + projectsScore) / 5);
    document.getElementById("pg-readiness-score").innerText = `${avgScore}%`;

    // Circular gauge offset
    const circle = document.getElementById("pg-readiness-circle");
    if (circle) {
        const circumference = 364; // 2 * PI * 58
        const offset = circumference - (avgScore / 100) * circumference;
        circle.style.strokeDashoffset = offset;
    }

    // Badge styling and text
    const badge = document.getElementById("pg-readiness-badge");
    if (avgScore >= 85) {
        badge.innerText = "Excellent";
        badge.style.background = "rgba(16,185,129,0.2)";
        badge.style.color = "var(--success)";
    } else if (avgScore >= 70) {
        badge.innerText = "Good";
        badge.style.background = "rgba(245,158,11,0.2)";
        badge.style.color = "var(--warning)";
    } else {
        badge.innerText = "Needs Improvement";
        badge.style.background = "rgba(239,68,68,0.2)";
        badge.style.color = "#ef4444";
    }

    // Draw dynamic Priorities list
    const itemsMap = {
        "linkedin": { name: "LinkedIn Profile", color: "danger", bg: "rgba(239,68,68,0.1)", border: "rgba(239,68,68,0.2)", label: "HIGH PRIORITY" },
        "github": { name: "GitHub Profile", color: "danger", bg: "rgba(239,68,68,0.1)", border: "rgba(239,68,68,0.2)", label: "HIGH PRIORITY" },
        "portfolio": { name: "Personal Portfolio Site", color: "danger", bg: "rgba(239,68,68,0.1)", border: "rgba(239,68,68,0.2)", label: "HIGH PRIORITY" },
        "resume": { name: "ATS Resume Optimization", color: "danger", bg: "rgba(239,68,68,0.1)", border: "rgba(239,68,68,0.2)", label: "HIGH PRIORITY" },
        "projects": { name: "Technical Projects Showcase", color: "danger", bg: "rgba(239,68,68,0.1)", border: "rgba(239,68,68,0.2)", label: "HIGH PRIORITY" },
        "certifications": { name: "Cloud/Language Certifications", color: "danger", bg: "rgba(239,68,68,0.1)", border: "rgba(239,68,68,0.2)", label: "HIGH PRIORITY" },
        "achievements": { name: "Achievements & Hackathons", color: "danger", bg: "rgba(239,68,68,0.1)", border: "rgba(239,68,68,0.2)", label: "HIGH PRIORITY" },
        "profile": { name: "Professional Profile Seeding", color: "danger", bg: "rgba(239,68,68,0.1)", border: "rgba(239,68,68,0.2)", label: "HIGH PRIORITY" }
    };

    const priorities = [];
    const checklistItems = [
        "linkedin", "github", "portfolio", "resume", "projects", "certifications", "achievements", "profile"
    ];

    checklistItems.forEach(item => {
        const val = document.getElementById(`chk-${item}`)?.value || "Needs Improvement";
        if (val === "Needs Improvement") {
            priorities.push({ id: item, status: "Needs Improvement", score: 3 });
        } else if (val === "In Progress") {
            priorities.push({ id: item, status: "In Progress", score: 2 });
        } else {
            priorities.push({ id: item, status: "Complete", score: 1 });
        }
    });

    priorities.sort((a, b) => b.score - a.score);

    const prioritiesContainer = document.getElementById("pg-priorities-container");
    if (prioritiesContainer) {
        prioritiesContainer.innerHTML = "";
        priorities.forEach(p => {
            const def = itemsMap[p.id];
            let label = "LOW PRIORITY";
            let color = "success";
            let bg = "rgba(16,185,129,0.08)";
            let border = "rgba(16,185,129,0.15)";

            if (p.status === "Needs Improvement") {
                label = "HIGH PRIORITY";
                color = "danger";
                bg = "rgba(239,68,68,0.08)";
                border = "rgba(239,68,68,0.15)";
            } else if (p.status === "In Progress") {
                label = "MEDIUM PRIORITY";
                color = "warning";
                bg = "rgba(245,158,11,0.08)";
                border = "rgba(245,158,11,0.15)";
            }

            const div = document.createElement("div");
            div.className = `p-3 rounded border border-${color} border-opacity-20`;
            div.style.background = bg;
            div.style.borderColor = border;
            div.innerHTML = `
                <span class="badge bg-${color} text-xs mb-1">${label}</span>
                <div class="fw-bold text-white text-sm">${def.name}</div>
                <div class="text-secondary text-xs mt-1">Status: ${p.status} | Suggested Action: ${p.status === "Needs Improvement" ? "Re-evaluate and incorporate standard template items." : p.status === "In Progress" ? "Polishing details, documentation, and layout formats." : "Fully complete! Link to your documents and profiles."}</div>
            `;
            prioritiesContainer.appendChild(div);
        });
    }
}

function saveProfileUrl(type, url) {
    localStorage.setItem(`pg_url_${type}`, url);
}

function openPortfolioProfile(type) {
    const url = localStorage.getItem(`pg_url_${type}`) || document.getElementById(`pg-url-${type}`)?.value || "";
    if (!url) {
        alert(`Please enter your ${type.charAt(0).toUpperCase() + type.slice(1)} Profile URL in the corresponding card first.`);
        return;
    }
    window.open(url, "_blank");
}

async function uploadPortfolioResume(event) {
    event.preventDefault();
    if (!accessToken) return;

    const fileInput = document.getElementById("pg-resume-file");
    const statusEl = document.getElementById("pg-resume-upload-status");
    const uploadBtn = document.getElementById("pg-resume-upload-btn");

    if (fileInput.files.length === 0) return;

    const targetCareer = document.getElementById("pg-target-career").value;
    const formData = new FormData();
    formData.append("target_job_title", targetCareer);
    formData.append("file", fileInput.files[0]);

    statusEl.innerText = "Analyzing resume layout and skills...";
    statusEl.className = "text-info text-xs d-block mb-2";
    uploadBtn.disabled = true;

    try {
        const res = await fetch(`${API_ROOT}/career/analyze`, {
            method: "POST",
            headers: { "Authorization": `Bearer ${accessToken}` },
            body: formData
        });

        if (res.ok) {
            const data = await res.json();
            statusEl.innerText = "Resume uploaded & parsed successfully!";
            statusEl.className = "text-success text-xs d-block mb-2";
            
            if (data.target_job_title) {
                const select = document.getElementById("pg-target-career");
                const options = Array.from(select.options).map(o => o.value);
                if (options.includes(data.target_job_title)) {
                    select.value = data.target_job_title;
                } else {
                    select.value = "Other";
                }
                localStorage.setItem("pg_target_career", select.value);
                onPortfolioCareerChange();
            }

            if (data.current_skills && data.current_skills.length > 0) {
                const skillsField = document.getElementById("an-skills");
                if (skillsField) {
                    skillsField.value = data.current_skills.join(", ");
                    localStorage.setItem("pg_an_skills", skillsField.value);
                }
            }

            const chkResume = document.getElementById("chk-resume");
            if (chkResume) {
                chkResume.value = "Complete";
                localStorage.setItem("pg_chk_resume", "Complete");
                onChecklistChange();
            }

            fileInput.value = "";
        } else {
            statusEl.innerText = "Upload parsed failed. Ensure standard document format.";
            statusEl.className = "text-danger text-xs d-block mb-2";
        }
    } catch (e) {
        statusEl.innerText = "Connection lost. Try again.";
        statusEl.className = "text-danger text-xs d-block mb-2";
    } finally {
        uploadBtn.disabled = false;
    }
}

function evaluateShowcaseProject() {
    const name = document.getElementById("pg-proj-name")?.value || "";
    const tech = document.getElementById("pg-proj-tech")?.value || "";
    const problem = document.getElementById("pg-proj-problem")?.value || "";
    const features = document.getElementById("pg-proj-features")?.value || "";
    const github = document.getElementById("pg-proj-github")?.value || "";
    const demo = document.getElementById("pg-proj-demo")?.value || "";
    const role = document.getElementById("pg-proj-role")?.value || "";

    localStorage.setItem("pg_proj_name", name);
    localStorage.setItem("pg_proj_tech", tech);
    localStorage.setItem("pg_proj_problem", problem);
    localStorage.setItem("pg_proj_features", features);
    localStorage.setItem("pg_proj_github", github);
    localStorage.setItem("pg_proj_demo", demo);
    localStorage.setItem("pg_proj_role", role);

    const adviceBox = document.getElementById("pg-showcase-advice");
    if (!adviceBox) return;

    if (!name && !tech && !problem) {
        adviceBox.innerText = "Please enter project details above to dynamically generate guidance tips.";
        adviceBox.className = "p-3 rounded text-secondary small bg-opacity-10 bg-info border border-info border-opacity-10";
        return;
    }

    let tips = [];
    if (!problem) tips.push("⚠️ Add a clear problem statement explaining why you built this project and what pain point it solves.");
    if (!github) tips.push("⚠️ Add your source code repository link. Open sourcing codebases is essential to build technical recruiter trust.");
    if (!demo) tips.push("⚠️ Deploy your application and provide a live demo URL. Recruiters prefer clicking a button over running code locally.");
    if (!role) tips.push("⚠️ Clarify your direct role / individual contributions so hiring managers understand your skills.");
    if (tech && tech.split(",").length < 3) tips.push("💡 List all core components of your architecture (DBs, caching mechanisms, hosting platforms) alongside languages.");

    if (tips.length === 0) {
        adviceBox.innerHTML = "<div class='text-success fw-bold'><i class='bi bi-check-circle-fill me-1'></i> Professional Showcase Setup! All key features, deployments, and repositories are documented. Ready for recruiter inspection!</div>";
        adviceBox.className = "p-3 rounded text-success small bg-opacity-10 bg-success border border-success border-opacity-10";
    } else {
        adviceBox.innerHTML = `<strong>Presentation Guidelines:</strong><ul class='ps-3 mb-0 mt-1'>${tips.map(t => `<li class='mb-1'>${t}</li>`).join('')}</ul>`;
        adviceBox.className = "p-3 rounded text-warning small bg-opacity-10 bg-warning border border-warning border-opacity-10";
    }
}

async function triggerAIPortfolioAnalyzer() {
    if (!accessToken) return;

    const career = document.getElementById("pg-target-career").value;
    const exp = document.getElementById("an-experience").value;
    const skills = document.getElementById("an-skills").value;
    const projectsCount = parseInt(document.getElementById("an-projects-count").value) || 0;

    localStorage.setItem("pg_an_experience", exp);
    localStorage.setItem("pg_an_skills", skills);
    localStorage.setItem("pg_an_projects_count", projectsCount);

    const chkLinkedin = document.getElementById("chk-linkedin")?.value || "Needs Improvement";
    const chkGithub = document.getElementById("chk-github")?.value || "Needs Improvement";
    const chkPortfolio = document.getElementById("chk-portfolio")?.value || "Needs Improvement";
    const chkResume = document.getElementById("chk-resume")?.value || "Needs Improvement";
    const chkCertifications = document.getElementById("chk-certifications")?.value || "Needs Improvement";

    const btn = document.getElementById("pg-analyzer-btn");
    const originalText = btn.innerText;
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Auditing...`;

    const payload = {
        target_career: career,
        experience_level: exp,
        current_skills: skills || "Not listed",
        num_projects: projectsCount,
        linkedin_status: chkLinkedin,
        github_status: chkGithub,
        portfolio_status: chkPortfolio,
        resume_status: chkResume,
        certification_status: chkCertifications
    };

    try {
        const res = await fetch(`${API_ROOT}/career/portfolio-analyze`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${accessToken}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            const data = await res.json();
            
            const strList = document.getElementById("an-out-strengths");
            strList.innerHTML = "";
            data.strengths.forEach(s => strList.innerHTML += `<li class="mb-1">${s}</li>`);

            const weakList = document.getElementById("an-out-weaknesses");
            weakList.innerHTML = "";
            data.weaknesses.concat(data.missing_elements).forEach(w => weakList.innerHTML += `<li class="mb-1">${w}</li>`);

            const prioList = document.getElementById("an-out-priority");
            prioList.innerHTML = "";
            data.priority_improvements.forEach(p => prioList.innerHTML += `<li class="mb-1">${p}</li>`);

            document.getElementById("an-out-linkedin").innerText = data.linkedin_improvements.join(", ");
            document.getElementById("an-out-github").innerText = data.github_improvements.join(", ");
            document.getElementById("an-out-resume").innerText = data.resume_improvements.join(", ");
            document.getElementById("an-out-portfolio").innerText = data.portfolio_improvements.join(", ");

            const projList = document.getElementById("an-out-projects");
            projList.innerHTML = "";
            data.recommended_projects.forEach(p => projList.innerHTML += `<li class="mb-1">${p}</li>`);

            document.getElementById("pg-analyzer-output").classList.remove("d-none");
        } else {
            alert("Analyzer failed. Please verify API configuration.");
        }
    } catch (e) {
        console.error(e);
        alert("Lost server connection during audit.");
    } finally {
        btn.disabled = false;
        btn.innerText = originalText;
    }
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

