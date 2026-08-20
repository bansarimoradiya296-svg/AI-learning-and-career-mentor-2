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

    // Static "View All" toggle for hardcoded project cards
    const viewAllBtn = document.getElementById("rm-view-all-btn");
    const projectsGrid = document.getElementById("rm-projects-grid");
    if (viewAllBtn && projectsGrid) {
        let staticShowingAll = false;
        const allCards = () => projectsGrid.querySelectorAll(".rm-project-card");
        // Hide cards beyond 3 initially only if more than 3 exist
        const initStatic = () => {
            const cards = allCards();
            if (cards.length > 3) {
                cards.forEach((c, i) => { if (i >= 3) c.style.display = "none"; });
                viewAllBtn.style.display = "inline-block";
                viewAllBtn.onclick = () => {
                    // Only run if still showing static cards (not dynamic)
                    if (projectsGrid.dataset.dynamic === "true") return;
                    staticShowingAll = !staticShowingAll;
                    allCards().forEach((c, i) => {
                        if (i >= 3) c.style.display = staticShowingAll ? "flex" : "none";
                    });
                    viewAllBtn.textContent = staticShowingAll ? "Show Less" : "View All";
                };
            } else {
                viewAllBtn.style.display = cards.length > 0 ? "none" : "none";
            }
        };
        initStatic();
    }
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
    
    title.parentElement.style.display = "block"; // Reset to visible
    
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
        title.parentElement.style.display = "none"; // Hide on roadmap tab
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

let _rmShowingAll = false;

async function uploadResume(event) {
    event.preventDefault();
    const title = document.getElementById("target-job").value;
    const fileInput = document.getElementById("resume-file");
    if (!accessToken) {
        document.getElementById("rm-upload-status").innerHTML = `<span class="text-danger">Please sign in first to analyze your resume and generate a roadmap.</span>`;
        return;
    }
    
    if (fileInput.files.length === 0) return;

    const formData = new FormData();
    formData.append("target_job_title", title);
    formData.append("file", fileInput.files[0]);

    const status = document.getElementById("rm-upload-status");
    status.innerHTML = `<div class="spinner-border spinner-border-sm text-primary me-2" role="status"></div>AI Recruiter is parsing resume and plotting roadmap...`;

    try {
        const res = await fetch(`${API_ROOT}/career/analyze`, {
            method: "POST",
            headers: { "Authorization": `Bearer ${accessToken}` },
            body: formData
        });

        if (res.ok) {
            status.innerHTML = `<span class="text-success"><i class="bi bi-check-circle-fill me-1"></i>Roadmap generated! Loading...</span>`;
            setTimeout(() => {
                const modalEl = document.getElementById('editGoalModal');
                const modalInstance = bootstrap.Modal.getInstance(modalEl);
                if (modalInstance) modalInstance.hide();
                loadCareerGoalProfile();
            }, 800);
        } else {
            status.innerHTML = `<span class="text-danger">Failed to analyze resume. Please try again.</span>`;
        }
    } catch (e) {
        status.innerHTML = `<span class="text-danger">Request timed out. Check your connection.</span>`;
    }
}

async function loadCareerGoalProfile() {
    if (!accessToken) return;
    try {
        const res = await fetch(`${API_ROOT}/career/goals?_t=${new Date().getTime()}`, {
            headers: { "Authorization": `Bearer ${accessToken}` },
            cache: "no-store"
        });
        if (!res.ok) return;

        const goals = await res.json();
        if (goals.length === 0) return;

        const goal = goals[0];
        const roadmap = (goal.roadmaps && goal.roadmaps.length > 0) ? goal.roadmaps[0] : null;

        // ── 1. Info Cards ────────────────────────────────
        const titleEl = document.getElementById("rm-goal-title");
        if (titleEl) titleEl.textContent = goal.target_job_title || "—";
        
        if (goal.roadmap_status === "FAILED" || (!goal.projects || goal.projects.length === 0)) {
            const roadmapPanel = document.getElementById("rm-roadmap-panel");
            if (roadmapPanel) {
                roadmapPanel.innerHTML = `
                    <div class="alert alert-danger p-4 text-center">
                        <i class="bi bi-exclamation-triangle-fill fs-1 d-block mb-2"></i>
                        <h5 class="fw-bold">AI Analysis Failed</h5>
                        <p>We could not generate your personalized roadmap. The backend reported an AI error.</p>
                    </div>
                `;
            }
            const projectsPanel = document.getElementById("rm-projects-panel");
            if (projectsPanel) projectsPanel.classList.add("d-none");
            
            const skillGapPanel = document.getElementById("skill-gap-panel");
            if (skillGapPanel) skillGapPanel.innerHTML = `<div class="text-secondary p-3">Skill analysis failed.</div>`;
            return;
        }

        // Derive level from job readiness score
        const score = goal.job_readiness_score || 0;
        const level = score >= 70 ? "Advanced" : score >= 40 ? "Intermediate" : "Beginner";
        document.getElementById("rm-level").textContent = level;
        document.getElementById("rm-level-msg").textContent = score >= 70 ? "Great progress!" : "Keep learning!";

        // Estimated time will be computed after phases array is ready (see below)

        // ── 2. Roadmap Summary Sidebar ───────────────────
        let structure = roadmap ? roadmap.structure : null;
        if (typeof structure === 'string') {
            try { structure = JSON.parse(structure); } catch (e) { console.error("Failed to parse roadmap structure", e); }
        }
        const phases = (structure && structure.phases) ? structure.phases : [];
        document.getElementById("rm-summary-phases").textContent = phases.length;

        const totalTopics = phases.reduce((acc, p) => acc + (p.milestones ? p.milestones.length : 0), 0);
        document.getElementById("rm-summary-topics").textContent = totalTopics;

        const projectCount = (goal.projects && goal.projects.length) ? goal.projects.length : 0;
        document.getElementById("rm-summary-projects").textContent = projectCount;

        // ── Update Skills List ───────────────────────────
        const skillsList = document.getElementById("rm-skills-list");
        if (skillsList && goal.target_skills) {
            let targetSkills = goal.target_skills;
            if (typeof targetSkills === 'string') {
                try { targetSkills = JSON.parse(targetSkills); } catch(e) { targetSkills = []; }
            }
            if (Array.isArray(targetSkills) && targetSkills.length > 0) {
                const currentPct = roadmap ? (roadmap.completion_percentage || 0) : 0;
                // Cap the display at 100% just in case
                const displayPct = Math.min(100, Math.round(currentPct));
                
                skillsList.innerHTML = targetSkills.map(skill => `
                    <div class="rm-skill-row">
                        <div><span>${skill}</span><span class="rm-skill-pct">${displayPct}%</span></div>
                        <div class="rm-skill-bar"><div class="rm-skill-fill" style="width:${displayPct}%"></div></div>
                    </div>
                `).join('');
            }
        }

        // ── Estimated Time (computed here after phases is ready) ──
        if (phases.length > 0) {
            const totalWeeks = phases.reduce((acc, p) => {
                let w = p.estimated_weeks || 0;
                if (typeof w === 'string') {
                    const match = w.match(/\d+/g);
                    w = match ? parseInt(match[match.length - 1], 10) : 0;
                }
                return acc + Number(w);
            }, 0);
            console.log('[CareerMentor] totalWeeks:', totalWeeks);
            const months = totalWeeks > 0 ? Math.max(1, Math.round(totalWeeks / 4.33)) : null;
            document.getElementById("rm-est-time").textContent = months ? `${months} – ${months + 2} Months` : "—";
        } else {
            document.getElementById("rm-est-time").textContent = "—";
        }

        // ── 3. Phase Connector + Phase Cards ─────────────
        if (phases.length > 0) {
            const uploadPanel = document.getElementById("rm-upload-panel");
            if (uploadPanel) uploadPanel.classList.add("d-none");
            
            const roadmapPanel = document.getElementById("rm-roadmap-panel");
            if (roadmapPanel) roadmapPanel.classList.remove("d-none");

            // Build connector nodes
            const connector = document.getElementById("rm-phase-connector");
            connector.innerHTML = `<div class="rm-connector-line"></div>`;
            phases.forEach((phase, i) => {
                const pct = roadmap.completion_percentage || 0;
                const perPhase = 100 / phases.length;
                let nodeClass = "rm-node-upcoming";
                if (pct >= (i + 1) * perPhase) nodeClass = "rm-node-completed";
                else if (pct >= i * perPhase) nodeClass = "rm-node-inprogress";
                connector.innerHTML += `<div class="rm-connector-node ${nodeClass}"><span>${i + 1}</span></div>`;
            });

            // Build phase cards
            const phasesGrid = document.getElementById("rm-phases-grid");
            phasesGrid.innerHTML = "";
            
            let activePhaseIndex = phases.findIndex(p => p.status === "inprogress");
            if (activePhaseIndex === -1) {
                activePhaseIndex = phases.findIndex(p => !p.status || p.status === "upcoming");
                if (activePhaseIndex === -1) activePhaseIndex = 0;
            }

            phases.forEach((phase, i) => {
                // Determine card class from stored status (fallback to completion_percentage)
                const storedStatus = phase.status || "";
                let cardClass = "rm-phase-upcoming";
                if (storedStatus === "completed")  cardClass = "rm-phase-completed";
                else if (storedStatus === "inprogress") cardClass = "rm-phase-inprogress";
                
                if (i === activePhaseIndex) {
                    cardClass += " rm-phase-active-highlight";
                }

                const iconColors = ["rm-icon-blue","rm-icon-blue","rm-icon-orange","rm-icon-green"];
                const phaseIcons = ["bi-mortarboard-fill","bi-tools","bi-graph-up-arrow","bi-rocket-takeoff-fill"];
                const iconColor = iconColors[i % iconColors.length];
                const phaseIcon = phaseIcons[i % phaseIcons.length];
                const milestones = (phase.milestones || []).slice(0, 4).map(m =>
                    `<li><i class="bi bi-check-circle-fill text-primary" style="font-size:0.65rem;"></i>${m}</li>`
                ).join("");

                const phaseNum = phase.phase_num || (i + 1);
                const selectId = `phase-status-select-${phaseNum}`;

                phasesGrid.innerHTML += `
                    <div class="rm-phase-card ${cardClass}" id="phase-card-${phaseNum}">
                        <div class="rm-phase-header">
                            <div class="rm-phase-icon ${iconColor}"><i class="bi ${phaseIcon}"></i></div>
                            <span class="rm-phase-label">Phase ${phaseNum}</span>
                        </div>
                        <h5 class="rm-phase-title">${phase.title}</h5>
                        <div class="rm-phase-duration"><i class="bi bi-clock me-1"></i>Duration: ${String(phase.estimated_weeks || "?").replace(/weeks?/i, '').trim()} Weeks</div>
                        <p class="rm-phase-desc">${phase.description || "Master key concepts for this phase."}</p>
                        <ul class="rm-topic-list">${milestones}</ul>
                        <div class="rm-phase-status-control mt-2">
                            <select id="${selectId}" class="form-select glass-input form-select-sm mb-2" onchange="this.nextElementSibling.classList.remove('d-none')">
                                <option value="upcoming"   ${storedStatus === "upcoming"   || !storedStatus ? "selected" : ""}>⏳ Upcoming</option>
                                <option value="inprogress" ${storedStatus === "inprogress" ? "selected" : ""}>🔄 In Progress</option>
                                <option value="completed"  ${storedStatus === "completed"  ? "selected" : ""}>✅ Completed</option>
                            </select>
                            <button class="btn btn-sm btn-primary-custom w-100 d-none"
                                onclick="updatePhaseStatus('${roadmap.id}', ${phaseNum}, '${selectId}')">
                                <i class="bi bi-check2 me-1"></i>Update Status
                            </button>
                        </div>
                    </div>`;
            });
        }


        // ── 4. Projects Grid with View All ───────────────
        if (goal.projects && goal.projects.length > 0) {
            document.getElementById("rm-projects-panel").classList.remove("d-none");
            _rmShowingAll = false;
            renderProjectsGrid(goal.projects);

            const viewAllBtn = document.getElementById("rm-view-all-btn");
            if (goal.projects.length > 3) {
                viewAllBtn.style.display = "inline-block";
                viewAllBtn.onclick = () => {
                    _rmShowingAll = !_rmShowingAll;
                    viewAllBtn.textContent = _rmShowingAll ? "Show Less" : "View All";
                    renderProjectsGrid(goal.projects);
                };
            } else {
                viewAllBtn.style.display = "none";
            }
        }

        // ── 5. Skills Sidebar ────────────────────────────
        if (goal.target_skills && goal.target_skills.length > 0) {
            const skillsList = document.getElementById("rm-skills-list");
            skillsList.innerHTML = "";
            const completionPct = (roadmap && roadmap.completion_percentage) ? roadmap.completion_percentage : 0;
            goal.target_skills.slice(0, 6).forEach((skill, idx) => {
                const basePct = 20 + idx * 3;
                const earnedPct = Math.round(completionPct * (0.85 + idx * 0.03));
                const skillPct = Math.min(100, Math.max(basePct, basePct + earnedPct));
                skillsList.innerHTML += `
                    <div class="rm-skill-row">
                        <div><span>${skill}</span><span class="rm-skill-pct">${skillPct}%</span></div>
                        <div class="rm-skill-bar"><div class="rm-skill-fill" style="width:${skillPct}%"></div></div>
                    </div>`;
            });
        }

        // ── 6. Skill Gap Panel ───────────────────────────
        const gapPanel = document.getElementById("skill-gap-panel");
        gapPanel.innerHTML = `
            <h6 class="rm-sidebar-title mb-2">Skill Gap Analysis</h6>
            <p class="small text-info mb-1">Targeting: <strong>${goal.target_job_title}</strong></p>
            <p class="small text-secondary mb-1">Current Skills: ${(goal.current_skills || []).slice(0, 4).join(", ") || "—"}</p>
            <p class="small text-warning mb-0">Target Gaps: ${(goal.target_skills || []).slice(0, 4).join(", ") || "—"}</p>`;

    } catch (e) {
        console.error("Career roadmap load error:", e);
    }
}

function renderProjectsGrid(projects) {
    const grid = document.getElementById("rm-projects-grid");
    grid.innerHTML = "";
    const limit = _rmShowingAll ? projects.length : 3;
    const projIcons = ["bi-bar-chart-fill", "bi-database-fill", "bi-graph-up", "bi-lightbulb-fill", "bi-code-slash"];
    const iconColors = ["rm-icon-blue", "rm-icon-blue", "rm-icon-orange", "rm-icon-green", "rm-icon-blue"];
    
    projects.slice(0, limit).forEach((proj, i) => {
        const pIcon = projIcons[i % projIcons.length];
        const pColor = iconColors[i % iconColors.length];
        const tags = (proj.skills_gained || []).map(s =>
            `<span class="badge bg-primary bg-opacity-25 text-primary me-1 mb-1" style="font-size:0.65rem;">${s}</span>`
        ).join("");
        grid.innerHTML += `
            <div class="rm-project-card">
                <div class="rm-proj-icon ${pColor}"><i class="bi ${pIcon}"></i></div>
                <div style="flex:1">
                    <div class="rm-proj-name">${proj.title}</div>
                    <div class="rm-proj-type">${proj.complexity || "Standard"} Level</div>
                    <p class="text-secondary mb-1" style="font-size:0.72rem;">${proj.description || ""}</p>
                    <div>${tags}</div>
                </div>
            </div>`;
    });
}

function setRoadmapView(view) {
    document.getElementById("btn-timeline-view").classList.toggle("active", view === "timeline");
    document.getElementById("btn-list-view").classList.toggle("active", view === "list");
    const grid = document.getElementById("rm-phases-grid");
    if (view === "list") {
        grid.style.gridTemplateColumns = "1fr";
    } else {
        grid.style.gridTemplateColumns = "";
    }
}

function openGoalModal() {
    const modal = new bootstrap.Modal(document.getElementById('editGoalModal'));
    modal.show();
}

function exportRoadmap() {
    const goalTitle = (document.getElementById("rm-goal-title").textContent || "My Roadmap").trim();
    const level     = document.getElementById("rm-level").textContent;
    const estTime   = document.getElementById("rm-est-time").textContent;
    const date      = new Date().toLocaleDateString("en-IN", {day:"numeric",month:"long",year:"numeric"});

    const phaseCards = Array.from(document.querySelectorAll(".rm-phase-card")).map(card => {
        const label    = card.querySelector(".rm-phase-label")?.textContent || "";
        const title    = card.querySelector(".rm-phase-title")?.textContent || "";
        const duration = (card.querySelector(".rm-phase-duration")?.textContent || "").replace(/\s+/g," ").trim();
        const desc     = card.querySelector(".rm-phase-desc")?.textContent || "";
        const status   = (card.querySelector(".rm-phase-status")?.textContent || "").trim();
        const topics   = Array.from(card.querySelectorAll(".rm-topic-list li")).map(li => "<li>" + li.textContent.trim() + "</li>").join("");
        const isComp   = card.classList.contains("rm-phase-completed");
        const isInProg = card.classList.contains("rm-phase-inprogress");
        const bc = isComp ? "#4f8ef7" : isInProg ? "#6366f1" : "#334155";
        const sc = isComp ? "#10d9a0" : isInProg ? "#6366f1" : "#64748b";
        return '<div class="phase-card" style="border-color:' + bc + ';">' + '<div class="phase-label">' + label + '</div>' + '<div class="phase-title">' + title + '</div>' + '<div class="phase-dur">' + duration + '</div>' + '<p class="phase-desc">' + desc + '</p>' + '<ul class="topic-list">' + topics + '</ul>' + '<div class="phase-status" style="color:' + sc + ';">' + status + '</div></div>';
    }).join("");

    const projCards = Array.from(document.querySelectorAll(".rm-project-card")).map(card => {
        const name  = card.querySelector(".rm-proj-name")?.textContent || "";
        const type  = card.querySelector(".rm-proj-type")?.textContent || "";
        const phase = card.querySelector(".rm-proj-phase")?.textContent || "";
        return '<div class="proj-card"><div class="proj-name">' + name + '</div><div class="proj-type">' + type + '</div><span class="proj-badge">' + phase + '</span></div>';
    }).join("");

    const skillRows = Array.from(document.querySelectorAll(".rm-skill-row")).map(row => {
        const name = row.querySelector("span:first-child")?.textContent || "";
        const pct  = row.querySelector(".rm-skill-pct")?.textContent || "0%";
        return '<div class="skill-row"><div class="skill-label"><span>' + name + '</span><span>' + pct + '</span></div><div class="skill-bar"><div class="skill-fill" style="width:' + pct + ';"></div></div></div>';
    }).join("");

    const css = `* { margin:0; padding:0; box-sizing:border-box; } body { font-family:Arial,sans-serif; background:#ffffff; color:#0f172a; padding:24px; font-size:11px; } .hdr { display:flex; justify-content:space-between; border-bottom:2px solid #6366f1; padding-bottom:14px; margin-bottom:18px; } .hdr h1 { font-size:20px; font-weight:800; color:#0f172a; } .hdr p { font-size:10px; color:#475569; margin-top:3px; } .hdr-r { font-size:9px; color:#64748b; text-align:right; } .info-row { display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px; margin-bottom:16px; } .ic { border-radius:8px; padding:10px; border:1px solid #e2e8f0; } .ic-lbl { font-size:7px; text-transform:uppercase; color:#64748b; font-weight:700; } .ic-val { font-size:13px; font-weight:800; margin-top:3px; color:#0f172a; } .sec { font-size:12px; font-weight:700; border-left:3px solid #6366f1; padding-left:7px; margin:0 0 8px; color:#0f172a; } .phases-grid { display:grid; grid-template-columns:1fr 1fr; gap:7px; margin-bottom:16px; } .phase-card { border:1px solid #cbd5e1; border-radius:8px; padding:10px; background:#f8fafc; } .phase-label { font-size:7px; text-transform:uppercase; color:#64748b; font-weight:700; margin-bottom:3px; } .phase-title { font-size:11px; font-weight:800; margin-bottom:3px; color:#0f172a; } .phase-dur { font-size:8px; color:#475569; margin-bottom:4px; } .phase-desc { font-size:8px; color:#475569; margin-bottom:6px; } .topic-list { list-style:none; } .topic-list li { font-size:8px; color:#334155; padding:1px 0; } .topic-list li::before { content:"- "; color:#6366f1; } .phase-status { font-size:8px; font-weight:700; margin-top:6px; } .projs-grid { display:grid; grid-template-columns:1fr 1fr; gap:7px; margin-bottom:16px; } .proj-card { border:1px solid #cbd5e1; border-radius:7px; padding:8px; background:#f8fafc; } .proj-name { font-size:10px; font-weight:700; margin-bottom:2px; color:#0f172a; } .proj-type { font-size:8px; color:#475569; margin-bottom:4px; } .proj-badge { font-size:7px; font-weight:700; color:#6366f1; padding:1px 6px; border-radius:99px; border:1px solid rgba(99,102,241,0.3); background:#e0e7ff; } .skills-grid { display:grid; grid-template-columns:1fr 1fr; gap:7px; margin-bottom:16px; } .skill-label { display:flex; justify-content:space-between; font-size:9px; margin-bottom:2px; color:#0f172a; font-weight:600; } .skill-bar { height:4px; background:#e2e8f0; border-radius:99px; overflow:hidden; } .skill-fill { height:100%; background:linear-gradient(90deg,#6366f1,#8b5cf6); } .footer { margin-top:12px; border-top:1px solid #cbd5e1; padding-top:8px; font-size:8px; color:#64748b; text-align:center; } @media print { body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } @page { margin:6mm; size:A4 portrait; } }`;

    const rows = [
        "<!DOCTYPE html><html><head><meta charset=UTF-8><title>Roadmap</title><style>" + css + "</style></head><body>",
        "<div class=hdr><div><h1>Personalized Learning Roadmap</h1><p>Target: <strong style=color:#6366f1>" + goalTitle + "</strong></p></div><div class=hdr-r><div>" + date + "</div><div>AI Learning and Career Mentor</div></div></div>",
        "<div class=info-row>",
        "<div class=ic style=background:rgba(79,142,247,.12)><div class=ic-lbl>YOUR GOAL</div><div class=ic-val>" + goalTitle + "</div></div>",
        "<div class=ic style=background:rgba(16,185,129,.12)><div class=ic-lbl>CURRENT LEVEL</div><div class=ic-val>" + level + "</div></div>",
        "<div class=ic style=background:rgba(245,158,11,.12)><div class=ic-lbl>ESTIMATED TIME</div><div class=ic-val>" + estTime + "</div></div>",
        "</div>",
        "<div class=sec>Learning Phases</div><div class=phases-grid>" + phaseCards + "</div>",
        "<div class=sec>Projects You Will Build</div><div class=projs-grid>" + projCards + "</div>",
        "<div class=sec>Skills You Will Gain</div><div class=skills-grid>" + skillRows + "</div>",
        "<div class=footer>Generated by AI Learning and Career Mentor</div>",
        "</body></html>"
    ];

    const w = window.open("", "_blank", "width=1100,height=750");
    w.document.open();
    w.document.write(rows.join(""));
    w.document.close();
    setTimeout(() => { try { w.print(); } catch(e) {} }, 500);
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

async function updatePhaseStatus(roadmapId, phaseNum, selectId) {
    const select = document.getElementById(selectId);
    if (!select || !accessToken) return;
    
    const statusVal = select.value;
    const btn = select.nextElementSibling;
    const originalText = btn.innerHTML;
    
    btn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Updating...';
    btn.disabled = true;

    try {
        const res = await fetch(`${API_ROOT}/career/roadmaps/${roadmapId}/phase-status`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                "Authorization": `Bearer ${accessToken}`
            },
            body: JSON.stringify({
                phase_num: phaseNum,
                phase_status: statusVal
            })
        });

        if (res.ok) {
            // Reload the profile to reflect changes (progress bar, etc.)
            await loadCareerGoalProfile();
        } else {
            alert('Failed to update phase status.');
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    } catch (err) {
        console.error("Error updating phase status:", err);
        alert('An error occurred while updating status.');
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}
