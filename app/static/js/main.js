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
