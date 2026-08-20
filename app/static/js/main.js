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

// Global Popup & Toast Notification System
function showPopupMessage(message, type = "info", title = "", duration = 4000) {
    let container = document.getElementById("global-toast-container");
    if (!container) {
        container = document.createElement("div");
        container.id = "global-toast-container";
        container.style.cssText = "position: fixed; bottom: 24px; right: 24px; z-index: 10000000; max-width: 420px; display: flex; flex-direction: column; gap: 10px; pointer-events: none;";
        document.body.appendChild(container);
    }

    const accents = {
        success: { color: "#10b981", glow: "rgba(16, 185, 129, 0.25)", title: "Success" },
        error: { color: "#f43f5e", glow: "rgba(244, 63, 94, 0.25)", title: "Error" },
        danger: { color: "#f43f5e", glow: "rgba(244, 63, 94, 0.25)", title: "Error" },
        warning: { color: "#f59e0b", glow: "rgba(245, 158, 11, 0.25)", title: "Warning" },
        info: { color: "#38bdf8", glow: "rgba(56, 189, 248, 0.25)", title: "Notification" }
    };

    const icons = {
        success: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`,
        error: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f43f5e" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`,
        danger: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f43f5e" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`,
        warning: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`,
        info: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`
    };

    const normType = (type === "error" || type === "danger") ? "danger" : (type || "info");
    const accent = accents[normType] || accents.info;
    const iconSvg = icons[normType] || icons.info;
    const headerTitle = title || accent.title;

    const toastDiv = document.createElement("div");
    toastDiv.className = "custom-glass-toast";
    toastDiv.style.cssText = `
        pointer-events: auto;
        background: #0f172a !important;
        background-color: #0f172a !important;
        border: 1px solid rgba(255, 255, 255, 0.12) !important;
        border-left: 5px solid ${accent.color} !important;
        box-shadow: 0 20px 45px rgba(0, 0, 0, 0.85), 0 0 20px ${accent.glow} !important;
        border-radius: 14px !important;
        padding: 0 !important;
        color: #ffffff !important;
        overflow: hidden;
        min-width: 300px;
        max-width: 400px;
        animation: toastSlideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    `;

    toastDiv.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 14px 16px 8px 16px;">
            <div style="display: flex; align-items: center; gap: 8px;">
                <span>${iconSvg}</span>
                <strong style="color: #ffffff !important; font-weight: 700; font-size: 0.94rem; letter-spacing: 0.2px;">${escapeHtml(headerTitle)}</strong>
            </div>
            <button type="button" class="custom-toast-close" style="background: transparent; border: none; color: #94a3b8; font-size: 1.1rem; cursor: pointer; padding: 0 4px; line-height: 1; display: flex; align-items: center; justify-content: center; transition: color 0.2s ease;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
        </div>
        <div style="padding: 0 16px 14px 16px; color: #cbd5e1 !important; font-size: 0.88rem; line-height: 1.45;">
            ${escapeHtml(message)}
        </div>
        <div style="width: 100%; height: 3px; background: rgba(255, 255, 255, 0.08); overflow: hidden;">
            <div style="height: 100%; width: 100%; background: ${accent.color}; animation: toastProgress ${duration}ms linear forwards;"></div>
        </div>
    `;

    const closeBtn = toastDiv.querySelector(".custom-toast-close");
    if (closeBtn) {
        closeBtn.onmouseenter = () => { closeBtn.style.color = "#ffffff"; };
        closeBtn.onmouseleave = () => { closeBtn.style.color = "#94a3b8"; };
        closeBtn.onclick = () => {
            toastDiv.style.opacity = "0";
            toastDiv.style.transform = "translateX(40px)";
            toastDiv.style.transition = "all 0.25s ease";
            setTimeout(() => toastDiv.remove(), 250);
        };
    }

    container.appendChild(toastDiv);

    setTimeout(() => {
        if (toastDiv && toastDiv.parentNode) {
            toastDiv.style.opacity = "0";
            toastDiv.style.transform = "translateX(40px)";
            toastDiv.style.transition = "all 0.25s ease";
            setTimeout(() => toastDiv.remove(), 250);
        }
    }, duration);
}


// Attach globally
window.showPopupMessage = showPopupMessage;
window.showToast = showPopupMessage;
window.alert = (msg) => showPopupMessage(msg, "info", "System Notification");
window.prompt = (msg, def) => {
    showPopupMessage(msg, "info", "Action Required");
    return def || "";
};
window.confirm = (msg) => {
    showPopupMessage(msg, "info", "Confirmation");
    return true;
};


// Study Dropzone Handlers
function handleStudyFileSelected(input) {
    if (input.files && input.files[0]) {
        const file = input.files[0];
        const selectedCard = document.getElementById("study-file-selected-display");
        const nameEl = document.getElementById("selected-file-name");
        const sizeEl = document.getElementById("selected-file-size");
        
        if (nameEl) nameEl.innerText = file.name;
        if (sizeEl) sizeEl.innerText = formatFileSize(file.size);
        if (selectedCard) selectedCard.classList.remove("d-none");
    }
}

function clearSelectedStudyFile(event) {
    if (event) event.stopPropagation();
    const input = document.getElementById("study-file");
    if (input) input.value = "";
    const selectedCard = document.getElementById("study-file-selected-display");
    if (selectedCard) selectedCard.classList.add("d-none");
}

function formatFileSize(bytes) {
    if (!bytes || bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}


function escapeHtml(str) {
    if (!str) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function initDropzoneEvents() {
    const dropzone = document.getElementById("study-dropzone");
    const fileInput = document.getElementById("study-file");
    if (!dropzone || !fileInput) return;

    ["dragenter", "dragover"].forEach(eventName => {
        dropzone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropzone.classList.add("drag-over");
        }, false);
    });

    ["dragleave", "drop"].forEach(eventName => {
        dropzone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropzone.classList.remove("drag-over");
        }, false);
    });

    dropzone.addEventListener("drop", (e) => {
        const dt = e.dataTransfer;
        if (dt && dt.files && dt.files.length > 0) {
            fileInput.files = dt.files;
            handleStudyFileSelected(fileInput);
        }
    }, false);
}

// DOM Initializer
document.addEventListener("DOMContentLoaded", () => {
    // Check if browser has cached refresh cookie
    silentTokenRefresh();

    // Set default theme state
    const savedTheme = localStorage.getItem("theme") || "dark";
    document.body.setAttribute("data-theme", savedTheme);
    updateThemeIcon(savedTheme);

    // Initialize Dropzone Drag & Drop
    initDropzoneEvents();

    // Initialize 3D Hero Landing Scene
    setTimeout(() => {
        initLanding3DScene();
    }, 150);
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
    if (icon) {
        icon.textContent = theme === "dark" ? "🌙" : "☀️";
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
                showPopupMessage("Account verified successfully! Please sign in.", "success", "Verified");
            } else {
                errorBlock.className = "alert alert-danger";
                errorBlock.innerText = data.message || "OTP verification failed.";
                errorBlock.classList.remove("d-none");
                showPopupMessage(data.message || "OTP verification failed.", "error", "Verification Failed");
            }
        } catch (e) {
            errorBlock.className = "alert alert-danger";
            errorBlock.innerText = "System connection lost. Please try again.";
            errorBlock.classList.remove("d-none");
            showPopupMessage("System connection lost. Please try again.", "error", "Connection Error");
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
                showPopupMessage("Registration successful! Check verification code.", "info", "Verification Required");
            } else {
                // Login Success
                accessToken = data.access_token;
                currentUser = data.user;
                onLoginSuccess();
                
                // Hide modal
                const modalInstance = bootstrap.Modal.getInstance(document.getElementById("loginModal"));
                if (modalInstance) modalInstance.hide();
                showPopupMessage(`Welcome back, ${currentUser.first_name || currentUser.email}!`, "success", "Login Successful");
            }
        } else {
            errorBlock.className = "alert alert-danger";
            errorBlock.innerText = data.message || "Authentication failed.";
            errorBlock.classList.remove("d-none");
            showPopupMessage(data.message || "Authentication failed. Please check your credentials.", "error", "Login Failed");
        }
    } catch (e) {
        errorBlock.className = "alert alert-danger";
        errorBlock.innerText = "System connection lost. Please try again.";
        errorBlock.classList.remove("d-none");
        showPopupMessage("System connection lost. Please try again.", "error", "Connection Error");
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

// 3D HERO LANDING PAGE HANDLERS
function initLanding3DScene() {
    init3DConstellationCanvas("landing-3d-bg-canvas");
    init3DConstellationCanvas("global-3d-canvas");

    // Attach 3D Mouse Parallax Tilt to Landing Feature Cards
    document.querySelectorAll(".landing-card-3d").forEach(card => {
        card.addEventListener("mousemove", (e) => {
            const rect = card.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            const centerX = rect.width / 2;
            const centerY = rect.height / 2;
            const rotateX = ((y - centerY) / centerY) * -10;
            const rotateY = ((x - centerX) / centerX) * 10;
            card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-6px) scale(1.03)`;
        });

        card.addEventListener("mouseleave", () => {
            card.style.transform = "perspective(1000px) rotateX(0deg) rotateY(0deg) translateY(0deg) scale(1)";
        });
    });
}

function init3DConstellationCanvas(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const onResize = () => {
        width = canvas.width = window.innerWidth;
        height = canvas.height = window.innerHeight;
    };
    window.addEventListener("resize", onResize);

    // Elegant 3D Celestial Micro-Stars
    const starCount = 70;
    const stars = [];
    const fov = 420;

    for (let i = 0; i < starCount; i++) {
        stars.push({
            x: (Math.random() - 0.5) * 1500,
            y: (Math.random() - 0.5) * 1200,
            z: Math.random() * 800 + 100,
            vx: (Math.random() - 0.5) * 0.5,
            vy: (Math.random() - 0.5) * 0.5,
            vz: (Math.random() - 0.5) * 0.5,
            radius: Math.random() * 2.5 + 2,
            color: Math.random() > 0.5 ? "#38bdf8" : "#a855f7"
        });
    }

    let mouseX = 0;
    let mouseY = 0;
    let targetX = 0;
    let targetY = 0;

    window.addEventListener("mousemove", (e) => {
        mouseX = (e.clientX - width / 2) * 0.00035;
        mouseY = (e.clientY - height / 2) * 0.00035;
    }, { passive: true });

    const animate = () => {
        requestAnimationFrame(animate);

        ctx.clearRect(0, 0, width, height);

        targetX += (mouseX - targetX) * 0.05;
        targetY += (mouseY - targetY) * 0.05;

        // Project and Draw 3D Stars
        const projected = [];

        for (let i = 0; i < starCount; i++) {
            const s = stars[i];

            s.x += s.vx;
            s.y += s.vy;
            s.z += s.vz;

            if (s.x < -750) s.x = 750;
            if (s.x > 750) s.x = -750;
            if (s.y < -600) s.y = 600;
            if (s.y > 600) s.y = -600;
            if (s.z < 100) s.z = 900;
            if (s.z > 900) s.z = 100;

            const scale = fov / (fov + s.z);
            const px = (s.x + targetX * 350) * scale + width / 2;
            const py = (s.y + targetY * 350) * scale + height / 2;
            const alpha = Math.max(0.2, Math.min(0.9, (1 - s.z / 900)));

            projected.push({ x: px, y: py, radius: s.radius * scale, alpha: alpha, color: s.color });
        }

        // Draw Soft Glowing Connecting Filaments
        for (let i = 0; i < projected.length; i++) {
            for (let j = i + 1; j < projected.length; j++) {
                const p1 = projected[i];
                const p2 = projected[j];
                const dx = p1.x - p2.x;
                const dy = p1.y - p2.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < 120) {
                    const lineAlpha = (1 - dist / 120) * Math.min(p1.alpha, p2.alpha) * 0.4;
                    ctx.strokeStyle = `rgba(99, 102, 241, ${lineAlpha})`;
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.moveTo(p1.x, p1.y);
                    ctx.lineTo(p2.x, p2.y);
                    ctx.stroke();
                }
            }
        }

        // Draw Delicate Glowing Micro-Stars
        for (let p of projected) {
            ctx.beginPath();
            ctx.arc(p.x, p.y, Math.max(1, p.radius), 0, Math.PI * 2);
            ctx.fillStyle = p.color;
            ctx.globalAlpha = p.alpha;
            ctx.shadowBlur = 8;
            ctx.shadowColor = p.color;
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.globalAlpha = 1;
        }
    };

    animate();
}

function enterMainDashboardFromLanding() {
    document.body.classList.remove("landing-active");
    const overlay = document.getElementById("landing-hero-overlay");
    if (overlay) {
        overlay.classList.add("landing-warp-out");
        setTimeout(() => {
            overlay.classList.add("d-none");
            overlay.classList.remove("landing-warp-out");
        }, 800);
    }
    const dashboardNav = document.querySelector('a[onclick*="switchTab(\'dashboard\')"]');
    if (dashboardNav) {
        document.querySelectorAll(".nav-link-custom").forEach(el => el.classList.remove("active"));
        dashboardNav.classList.add("active");
    }
    switchTabDirect("dashboard");
}

function showLandingPage() {
    document.body.classList.add("landing-active");
    const overlay = document.getElementById("landing-hero-overlay");
    if (overlay) {
        overlay.classList.remove("d-none", "landing-warp-out");
        overlay.scrollTop = 0;
    }
}

function switchTabDirect(tabId) {
    activeTab = tabId;
    document.querySelectorAll(".tab-pane-custom").forEach(el => el.classList.add("d-none"));
    const pane = document.getElementById(`tab-${tabId}`);
    if (pane) pane.classList.remove("d-none");
    
    const title = document.getElementById("tab-title");
    const subtitle = document.getElementById("tab-subtitle");
    const breadcrumb = document.getElementById("tab-breadcrumb");
    
    const names = {
        dashboard: "Dashboard",
        study: "Study Companion",
        coding: "Coding Mentor",
        career: "Career Roadmap",
        interview: "Mock Interviews",
        admin: "Admin Panel"
    };
    if (breadcrumb) breadcrumb.innerText = names[tabId] || tabId;
    
    if (tabId === "dashboard") {
        if (title) title.innerText = "Student Dashboard";
        if (subtitle) subtitle.innerText = "Track your learning statistics and readiness indicators.";
        loadDashboardMetrics();
    } else if (tabId === "study") {
        if (title) title.innerText = "AI Study Companion";
        if (subtitle) subtitle.innerText = "Incorporate study notes, ask questions, and test your knowledge.";
        loadStudyCompanionData();
    } else if (tabId === "coding") {
        if (title) title.innerText = "AI Coding Mentor";
        if (subtitle) subtitle.innerText = "Compile code solutions and query complexity feedbacks.";
        loadCodingProblems();
    } else if (tabId === "career") {
        if (title) title.innerText = "Career Roadmap Architect";
        if (subtitle) subtitle.innerText = "Map learning pathways to close technical skill gaps.";
        loadCareerGoalProfile();
    } else if (tabId === "interview") {
        if (title) title.innerText = "Interview Simulator";
        if (subtitle) subtitle.innerText = "Practice Technical and HR questions in an interactive chat session.";
        loadMockInterviewTab();
    } else if (tabId === "admin") {
        if (title) title.innerText = "Admin Management Portal";
        if (subtitle) subtitle.innerText = "Monitor security logs and manage system users.";
        loadAdminPanelData();
    }
}

// Tab Switching Routing
function switchTab(tabId) {
    activeTab = tabId;
    
    // Nav highlight
    document.querySelectorAll(".nav-link-custom").forEach(el => el.classList.remove("active"));
    if (event && event.currentTarget) {
        event.currentTarget.classList.add("active");
    }
    
    // Pane visibility
    document.querySelectorAll(".tab-pane-custom").forEach(el => el.classList.add("d-none"));
    const pane = document.getElementById(`tab-${tabId}`);
    if (pane) pane.classList.remove("d-none");
    
    // Set headers
    const title = document.getElementById("tab-title");
    const subtitle = document.getElementById("tab-subtitle");
    const breadcrumb = document.getElementById("tab-breadcrumb");
    
    const names = {
        dashboard: "Dashboard",
        study: "Study Companion",
        coding: "Coding Mentor",
        career: "Career Roadmap",
        interview: "Mock Interviews",
        admin: "Admin Panel"
    };
    if (breadcrumb) breadcrumb.innerText = names[tabId] || tabId;
    
    if (tabId === "dashboard") {
        if (title) title.innerText = "Student Dashboard";
        if (subtitle) subtitle.innerText = "Track your learning statistics and readiness indicators.";
        loadDashboardMetrics();
    } else if (tabId === "study") {
        if (title) title.innerText = "AI Study Companion";
        if (subtitle) subtitle.innerText = "Incorporate study notes, ask questions, and test your knowledge.";
        loadStudyCompanionData();
    } else if (tabId === "coding") {
        if (title) title.innerText = "AI Coding Mentor";
        if (subtitle) subtitle.innerText = "Compile code solutions and query complexity feedbacks.";
        loadCodingProblems();
    } else if (tabId === "career") {
        if (title) title.innerText = "Career Roadmap Architect";
        if (subtitle) subtitle.innerText = "Map learning pathways to close technical skill gaps.";
        loadCareerGoalProfile();
    } else if (tabId === "interview") {
        if (title) title.innerText = "Interview Simulator";
        if (subtitle) subtitle.innerText = "Practice Technical and HR questions in an interactive chat session.";
        loadMockInterviewTab();
    } else if (tabId === "admin") {
        if (title) title.innerText = "Admin Management Portal";
        if (subtitle) subtitle.innerText = "Monitor security logs and manage system users.";
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
let loadedDocuments = [];
let currentFlashcardDeck = [];
let currentFlashcardIndex = 0;
let currentQuiz = null;
let currentQuizIndex = 0;
let userQuizAnswers = {};

async function loadStudyCompanionData() {
    if (!accessToken) return;
    try {
        const res = await fetch(`${API_ROOT}/study/documents`, {
            headers: { "Authorization": `Bearer ${accessToken}` }
        });
        if (res.ok) {
            loadedDocuments = await res.json();
            const list = document.getElementById("processed-docs-list");
            
            if (loadedDocuments.length === 0) {
                list.innerHTML = `<span class="text-secondary small">No files loaded yet. Upload material above.</span>`;
                return;
            }

            list.innerHTML = loadedDocuments.map(doc => {
                const ext = doc.file_name.split('.').pop().toUpperCase();
                const badgeColor = ext === 'PDF' ? '#ef4444' : ext === 'DOCX' ? '#3b82f6' : ext === 'PPTX' ? '#f97316' : '#10b981';
                const statusBadge = doc.embedding_status === 'SUCCESS' 
                    ? `<span class="badge rounded-pill" style="background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.3); font-size: 0.7rem; font-weight: 600;">● Indexed</span>`
                    : `<span class="badge rounded-pill" style="background: rgba(245, 158, 11, 0.15); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.3); font-size: 0.7rem; font-weight: 600;">⏳ Processing</span>`;

                return `
                <div class="p-3 mb-2 rounded-3" style="background: rgba(15, 23, 42, 0.75); border: 1px solid rgba(255, 255, 255, 0.08); transition: all 0.2s ease;">
                    <div class="d-flex justify-content-between align-items-center mb-2">
                        <div class="d-flex align-items-center gap-2 text-truncate" style="max-width: 70%;">
                            <span class="badge" style="background: ${badgeColor}22; color: ${badgeColor}; border: 1px solid ${badgeColor}55; font-size: 0.65rem; padding: 2px 6px;">${ext}</span>
                            <span class="fw-bold text-white small text-truncate" title="${escapeHtml(doc.file_name)}">
                                ${escapeHtml(doc.file_name)}
                            </span>
                        </div>
                        ${statusBadge}
                    </div>
                    <div class="d-flex gap-1 mt-2">
                        <button class="btn btn-sm btn-outline-info flex-fill py-1 fw-bold rounded-pill" onclick="openDocumentNotes('${doc.id}')" style="font-size: 0.75rem;">
                            📝 Notes
                        </button>
                        <button class="btn btn-sm btn-outline-primary flex-fill py-1 fw-bold rounded-pill" onclick="generateAndReviewFlashcards('${doc.id}')" style="font-size: 0.75rem;">
                            📇 Cards
                        </button>
                        <button class="btn btn-sm btn-outline-success flex-fill py-1 fw-bold rounded-pill" onclick="promptQuizGeneration('${doc.id}')" style="font-size: 0.75rem;">
                            🎯 Quiz
                        </button>
                    </div>
                </div>
                `;
            }).join('');
        }
    } catch (e) {
        console.error("Error loading study companion data", e);
    }
}

async function uploadDocument(event) {
    event.preventDefault();
    const fileInput = document.getElementById("study-file");
    const statusDiv = document.getElementById("upload-status");
    if (!fileInput.files || fileInput.files.length === 0) {
        showPopupMessage("Please select a PDF, DOCX, PPTX, or TXT file to upload.", "warning", "No File Selected");
        return;
    }
    
    showPopupMessage("Ingesting document and generating AI summaries, flashcards & quiz questions...", "info", "AI Processing Started");
    statusDiv.innerHTML = `<div class="d-flex align-items-center gap-2 text-info small py-1"><span class="spinner-border spinner-border-sm"></span> Processing document with AI...</div>`;
    
    const genShort = document.getElementById("gen-short");
    const genDetailed = document.getElementById("gen-detailed");
    const genNotes = document.getElementById("gen-notes");
    const genFlashcards = document.getElementById("gen-flashcards");
    const genQuiz = document.getElementById("gen-quiz");

    const formData = new FormData();
    formData.append("file", fileInput.files[0]);
    formData.append("generate_short", genShort ? genShort.checked : true);
    formData.append("generate_detailed", genDetailed ? genDetailed.checked : true);
    formData.append("generate_notes", genNotes ? genNotes.checked : true);
    formData.append("generate_flashcards", genFlashcards ? genFlashcards.checked : true);
    formData.append("generate_quiz", genQuiz ? genQuiz.checked : true);
    
    try {
        const res = await fetch(`${API_ROOT}/study/upload`, {
            method: "POST",
            headers: { "Authorization": `Bearer ${accessToken}` },
            body: formData
        });
        
        if (res.ok) {
            const doc = await res.json();
            showPopupMessage(`"${doc.file_name}" analyzed and indexed successfully!`, "success", "Ingestion Complete");
            statusDiv.innerHTML = "<span class='text-success'>✓ Ingestion complete. Opening study notes...</span>";
            clearSelectedStudyFile();
            await loadStudyCompanionData();
            setTimeout(() => {
                openDocumentNotes(doc.id);
            }, 600);
        } else {
            const err = await res.json();
            const errMsg = err.message || "Ingestion failed.";
            showPopupMessage(errMsg, "danger", "Upload Failed");
            statusDiv.innerHTML = `<span class='text-danger'>${errMsg}</span>`;
        }
    } catch (e) {
        showPopupMessage("Network error during document ingestion.", "danger", "Connection Error");
        statusDiv.innerHTML = "<span class='text-danger'>Connection error. Ingestion failed.</span>";
    }
}


// ─── Markdown Renderer Utility ───
function renderMarkdownToHtml(mdText) {
    if (!mdText) return "";
    
    // Use marked library if available
    if (typeof marked !== "undefined" && marked.parse) {
        try {
            return marked.parse(mdText);
        } catch (e) {
            console.warn("marked.parse error, using fallback", e);
        }
    }

    // High-fidelity fallback parser
    let html = escapeHtml(mdText);

    // Code blocks ```code```
    html = html.replace(/```([a-zA-Z]*)\n([\s\S]*?)```/g, (match, lang, code) => {
        return `<pre class="p-3 my-2 rounded bg-dark border border-secondary text-light font-monospace small" style="overflow-x:auto;"><code>${code.trim()}</code></pre>`;
    });

    // Inline code `code`
    html = html.replace(/`([^`]+)`/g, '<code class="bg-dark px-2 py-1 rounded text-warning font-monospace" style="font-size:0.85em;">$1</code>');

    // Headers
    html = html.replace(/^### (.*$)/gim, '<h6 class="fw-bold text-info mt-3 mb-2">$1</h6>');
    html = html.replace(/^## (.*$)/gim, '<h5 class="fw-bold text-white mt-3 mb-2">$1</h5>');
    html = html.replace(/^# (.*$)/gim, '<h4 class="fw-bold text-white mt-3 mb-2">$1</h4>');

    // Bold & Italics
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong class="text-white fw-bold">$1</strong>');
    html = html.replace(/\*([^*]+)\*/g, '<em class="text-info">$1</em>');

    // Bullet points (- or *)
    html = html.replace(/^\s*[-*]\s+(.*$)/gim, '<li class="mb-1 ms-3" style="color:#e2e8f0;">$1</li>');
    html = html.replace(/(<li.*<\/li>)/gims, '<ul class="my-2 ps-2" style="list-style-type: disc;">$1</ul>');

    // Line breaks & Paragraphs
    html = html.replace(/\n\n+/g, '</p><p class="mb-2" style="color:#cbd5e1; line-height:1.6;">');
    html = html.replace(/\n/g, '<br>');

    return `<p class="mb-2" style="color:#cbd5e1; line-height:1.6;">${html}</p>`;
}

async function askRAG(event) {
    if (event) event.preventDefault();
    const queryInput = document.getElementById("rag-query");
    const chatPane = document.getElementById("rag-chat-history");
    const query = queryInput.value.trim();
    if (!query) return;

    // Remove empty placeholder message if present
    const emptyNotice = chatPane.querySelector(".text-center.py-4");
    if (emptyNotice) {
        chatPane.innerHTML = "";
    }

    // 1. Append User Message Bubble
    const userMsgId = `user-msg-${Date.now()}`;
    chatPane.innerHTML += `
        <div id="${userMsgId}" class="d-flex justify-content-end mb-3" style="animation: fadeInSlide 0.3s ease;">
            <div class="rag-msg-user">
                <div class="d-flex align-items-center gap-2 mb-1 justify-content-end">
                    <strong style="font-size: 0.78rem; opacity: 0.9;">You</strong>
                    <div class="rounded-circle d-flex align-items-center justify-content-center text-white" style="width: 20px; height: 20px; background: rgba(255,255,255,0.2); font-size: 0.65rem;">👤</div>
                </div>
                <div>${escapeHtml(query)}</div>
            </div>
        </div>
    `;
    queryInput.value = "";
    chatPane.scrollTop = chatPane.scrollHeight;

    // 2. Append Animated AI Typing Indicator
    const typingId = `typing-indicator-${Date.now()}`;
    chatPane.innerHTML += `
        <div id="${typingId}" class="d-flex justify-content-start mb-3" style="animation: fadeInSlide 0.3s ease;">
            <div class="rag-msg-ai" style="min-width: 220px;">
                <div class="d-flex align-items-center gap-2 text-info small">
                    <span class="spinner-grow spinner-grow-sm text-primary"></span>
                    <span style="font-size: 0.82rem; letter-spacing: 0.3px;">AI Mentor analyzing document context...</span>
                </div>
            </div>
        </div>
    `;
    chatPane.scrollTop = chatPane.scrollHeight;

    try {
        const res = await fetch(`${API_ROOT}/study/ask?query=${encodeURIComponent(query)}`, {
            method: "POST",
            headers: { "Authorization": `Bearer ${accessToken}` }
        });
        
        // Remove typing indicator
        const typingEl = document.getElementById(typingId);
        if (typingEl) typingEl.remove();

        if (res.ok) {
            const data = await res.json();
            const formattedHtml = renderMarkdownToHtml(data.answer);
            const aiMsgId = `ai-msg-${Date.now()}`;
            
            chatPane.innerHTML += `
                <div id="${aiMsgId}" class="d-flex justify-content-start mb-3" style="animation: fadeInSlide 0.35s cubic-bezier(0.16, 1, 0.3, 1);">
                    <div class="rag-msg-ai w-100">
                        <div class="d-flex align-items-center justify-content-between pb-2 mb-2 border-bottom border-secondary border-opacity-25">
                            <div class="d-flex align-items-center gap-2">
                                <div class="rounded-circle d-flex align-items-center justify-content-center text-white" style="width: 24px; height: 24px; background: linear-gradient(135deg, #6366f1, #38bdf8); font-size: 0.72rem; font-weight: bold;">
                                    🧠
                                </div>
                                <strong class="text-white" style="font-size: 0.85rem;">AI Study Mentor</strong>
                                <span class="badge rounded-pill" style="background: rgba(99, 102, 241, 0.15); color: #818cf8; border: 1px solid rgba(99, 102, 241, 0.3); font-size: 0.65rem;">Gemini 3.7</span>
                            </div>
                            <div class="d-flex gap-1">
                                <button type="button" class="btn btn-sm btn-link text-secondary p-0 text-decoration-none" onclick="speakTextSnippet(this)" data-text="${escapeHtml(data.answer)}" title="Listen to response" style="font-size: 0.8rem;">
                                    🔊
                                </button>
                                <button type="button" class="btn btn-sm btn-link text-secondary p-0 text-decoration-none" onclick="copyResponseText(this)" data-text="${escapeHtml(data.answer)}" title="Copy answer" style="font-size: 0.8rem;">
                                    📋
                                </button>
                            </div>
                        </div>
                        <div class="ai-rendered-content" style="font-size: 0.9rem; line-height: 1.6;">
                            ${formattedHtml}
                        </div>
                    </div>
                </div>
            `;
        } else {
            const errData = await res.json().catch(() => ({}));
            chatPane.innerHTML += `
                <div class="d-flex justify-content-start mb-3">
                    <div class="rag-msg-ai border-danger text-danger small">
                        ⚠️ ${escapeHtml(errData.message || 'Unable to retrieve answer. Please verify document upload.')}
                    </div>
                </div>
            `;
        }
        chatPane.scrollTop = chatPane.scrollHeight;
    } catch (e) {
        const typingEl = document.getElementById(typingId);
        if (typingEl) typingEl.remove();
        chatPane.innerHTML += `
            <div class="d-flex justify-content-start mb-3">
                <div class="rag-msg-ai border-danger text-danger small">
                    ⚠️ Connection error. Please check server status.
                </div>
            </div>
        `;
        chatPane.scrollTop = chatPane.scrollHeight;
    }
}

function copyResponseText(btn) {
    const text = btn.getAttribute("data-text");
    if (text && navigator.clipboard) {
        navigator.clipboard.writeText(text);
        showPopupMessage("Answer copied to clipboard!", "success", "Copied");
        btn.innerText = "✓";
        setTimeout(() => { btn.innerText = "📋"; }, 1500);
    }
}

function speakTextSnippet(btn) {
    const text = btn.getAttribute("data-text");
    if (text && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
        const cleanText = text.replace(/[#*`_~[\]()-]/g, " ");
        const utterance = new SpeechSynthesisUtterance(cleanText);
        utterance.rate = 1.0;
        window.speechSynthesis.speak(utterance);
        showPopupMessage("Reading answer aloud...", "info", "Audio TTS");
    }
}


// ------------------- NOTE GENERATOR -------------------
let currentNotesDoc = null;

async function openDocumentNotes(docId) {
    try {
        const res = await fetch(`${API_ROOT}/study/documents/${docId}`, {
            headers: { "Authorization": `Bearer ${accessToken}` }
        });
        if (res.ok) {
            const doc = await res.json();
            currentNotesDoc = doc;
            
            const titleEl = document.getElementById("notes-modal-title");
            if (titleEl) {
                titleEl.innerHTML = `<span class="text-info me-2">📄</span>Notes: ${escapeHtml(doc.file_name)}`;
            }

            const shortPane = document.getElementById("notes-pane-short");
            const detailedPane = document.getElementById("notes-pane-detailed");
            const examPane = document.getElementById("notes-pane-exam");
            
            if (!doc.short_summary && !doc.detailed_summary && !doc.exam_notes) {
                if (shortPane) shortPane.innerHTML = `<div class="p-4 text-center text-info"><div class="spinner-border spinner-border-sm me-2"></div>Generating AI Notes with Gemini... Please wait a few seconds.</div>`;
                if (detailedPane) detailedPane.innerHTML = `<div class="p-4 text-center text-info"><div class="spinner-border spinner-border-sm me-2"></div>Analyzing key concepts & structuring breakdown...</div>`;
                if (examPane) examPane.innerHTML = `<div class="p-4 text-center text-info"><div class="spinner-border spinner-border-sm me-2"></div>Extracting high-yield exam revision cram notes...</div>`;

                const modalEl = document.getElementById("notesModal");
                let modal = bootstrap.Modal.getInstance(modalEl);
                if (!modal) modal = new bootstrap.Modal(modalEl);
                modal.show();

                await triggerNotesRegen(doc.id);
            } else {
                if (shortPane) shortPane.innerHTML = renderMarkdownToHtml(doc.short_summary) || `<p class="text-secondary">Executive summary not available.</p>`;
                if (detailedPane) detailedPane.innerHTML = renderMarkdownToHtml(doc.detailed_summary) || `<p class="text-secondary">Detailed breakdown not available.</p>`;
                if (examPane) examPane.innerHTML = renderMarkdownToHtml(doc.exam_notes) || `<p class="text-secondary">Exam cram notes not available.</p>`;

                const modalEl = document.getElementById("notesModal");
                let modal = bootstrap.Modal.getInstance(modalEl);
                if (!modal) modal = new bootstrap.Modal(modalEl);
                modal.show();
            }
        } else {
            showPopupMessage("Unable to load document notes.", "danger", "Notes Error");
        }
    } catch (e) {
        showPopupMessage("Failed to load document notes.", "danger", "Connection Error");
    }
}

function openNotesModalForSelected() {
    if (loadedDocuments && loadedDocuments.length > 0) {
        openDocumentNotes(loadedDocuments[0].id);
    } else {
        showPopupMessage("Please upload a document to view AI notes.", "warning", "No Documents");
    }
}

async function triggerNotesRegen(docId) {
    try {
        const shortPane = document.getElementById("notes-pane-short");
        if (shortPane) {
            shortPane.innerHTML = `<div class="p-4 text-center text-info"><div class="spinner-border spinner-border-sm me-2"></div>Generating fresh AI Study Notes with Gemini...</div>`;
        }
        
        const res = await fetch(`${API_ROOT}/study/documents/${docId}/notes`, {
            method: "POST",
            headers: { "Authorization": `Bearer ${accessToken}` }
        });
        if (res.ok) {
            showPopupMessage("AI Study Notes generated successfully!", "success", "Notes Ready");
            await openDocumentNotes(docId);
        } else {
            showPopupMessage("Failed to regenerate notes.", "danger", "Generation Failed");
        }
    } catch (e) {
        showPopupMessage("Error connecting to Note Generator service.", "danger", "Service Error");
    }
}

async function regenerateCurrentModalNotes() {
    if (!currentNotesDoc || !currentNotesDoc.id) {
        showPopupMessage("No active document selected for regeneration.", "warning", "No Active Doc");
        return;
    }
    const regenBtn = document.getElementById("notes-regen-btn");
    if (regenBtn) {
        regenBtn.disabled = true;
        regenBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span> Analyzing...`;
    }
    await triggerNotesRegen(currentNotesDoc.id);
    if (regenBtn) {
        regenBtn.disabled = false;
        regenBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg> <span>Regenerate with AI</span>`;
    }
}

function copyNotesToClipboard() {
    if (!currentNotesDoc) return;
    
    // Determine active tab
    const shortTab = document.getElementById("tab-btn-short");
    const detailedTab = document.getElementById("tab-btn-detailed");
    let contentToCopy = "";

    if (shortTab && shortTab.classList.contains("active")) {
        contentToCopy = currentNotesDoc.short_summary || "";
    } else if (detailedTab && detailedTab.classList.contains("active")) {
        contentToCopy = currentNotesDoc.detailed_summary || "";
    } else {
        contentToCopy = currentNotesDoc.exam_notes || "";
    }

    if (!contentToCopy) {
        contentToCopy = `# ${currentNotesDoc.file_name} Notes\n\n## Executive Summary\n${currentNotesDoc.short_summary || ''}\n\n## Detailed Breakdown\n${currentNotesDoc.detailed_summary || ''}\n\n## Exam Cram Notes\n${currentNotesDoc.exam_notes || ''}`;
    }

    if (navigator.clipboard) {
        navigator.clipboard.writeText(contentToCopy);
        showPopupMessage("Notes content copied to clipboard!", "success", "Copied");
    }
}

function downloadNotesAsMarkdown() {
    if (!currentNotesDoc) return;
    const mdContent = `# AI Study Notes: ${currentNotesDoc.file_name}\n\n---\n\n## 1. Executive Summary\n${currentNotesDoc.short_summary || 'N/A'}\n\n---\n\n## 2. Detailed Topic Breakdown\n${currentNotesDoc.detailed_summary || 'N/A'}\n\n---\n\n## 3. High-Yield Exam Cram Notes\n${currentNotesDoc.exam_notes || 'N/A'}\n\n---\n*Generated by AI Learning & Career Mentor on ${new Date().toLocaleDateString()}*`;
    
    const blob = new Blob([mdContent], { type: "text/markdown;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `${currentNotesDoc.file_name.replace(/\.[^/.]+$/, "")}_AI_Notes.md`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showPopupMessage("Downloaded study notes as Markdown (.md)", "success", "Exported");
}


// ------------------- FLASHCARDS (SM-2) -------------------
async function generateAndReviewFlashcards(docId) {
    try {
        const counter = document.getElementById("flashcard-counter");
        if (counter) counter.innerText = "Generating AI cards...";
        
        const modalEl = document.getElementById("flashcardsModal");
        let modal = bootstrap.Modal.getInstance(modalEl);
        if (!modal) modal = new bootstrap.Modal(modalEl);
        modal.show();
        
        document.getElementById("flashcard-question-text").innerHTML = `<div class="spinner-border spinner-border-sm text-primary me-2"></div> Generating smart flashcards with AI...`;
        document.getElementById("flashcard-answer-text").innerText = "Analyzing concepts from your document...";
        
        const res = await fetch(`${API_ROOT}/study/flashcards/generate?document_id=${docId}`, {
            method: "POST",
            headers: { "Authorization": `Bearer ${accessToken}` }
        });
        
        if (res.ok) {
            currentFlashcardDeck = await res.json();
            currentFlashcardIndex = 0;
            renderFlashcardCard();
            showPopupMessage(`Generated ${currentFlashcardDeck.length} study flashcards!`, "success", "Flashcards Ready");
        } else {
            const err = await res.json();
            document.getElementById("flashcard-question-text").innerText = "Failed to generate flashcards. Please try again.";
            showPopupMessage(err.message || "Failed to generate flashcards.", "error", "Flashcards Error");
        }
    } catch (e) {
        showPopupMessage("Flashcard generation error: " + e.message, "error", "Flashcard Error");
    }
}

async function triggerFlashcardReview() {
    try {
        let docId = (loadedDocuments && loadedDocuments.length > 0) ? loadedDocuments[0].id : null;
        let url = docId ? `${API_ROOT}/study/flashcards?document_id=${docId}` : `${API_ROOT}/study/flashcards`;
        
        const res = await fetch(url, {
            headers: { "Authorization": `Bearer ${accessToken}` }
        });
        
        if (res.ok) {
            currentFlashcardDeck = await res.json();
            if ((!currentFlashcardDeck || currentFlashcardDeck.length === 0) && docId) {
                return await generateAndReviewFlashcards(docId);
            }
            
            const modalEl = document.getElementById("flashcardsModal");
            let modal = bootstrap.Modal.getInstance(modalEl);
            if (!modal) modal = new bootstrap.Modal(modalEl);
            modal.show();

            if (!currentFlashcardDeck || currentFlashcardDeck.length === 0) {
                document.getElementById("flashcard-question-text").innerText = "No flashcards found. Upload a study document above to generate an interactive deck!";
                document.getElementById("flashcard-answer-text").innerText = "";
                document.getElementById("flashcard-counter").innerText = "Deck Empty";
                return;
            }
            currentFlashcardIndex = 0;
            renderFlashcardCard();
        }
    } catch (e) {
        showPopupMessage("Error loading flashcards: " + e.message, "error", "Error");
    }
}

function renderFlashcardCard() {
    const el = document.getElementById("flashcard-element");
    if (el) el.classList.remove("is-flipped");

    if (!currentFlashcardDeck || currentFlashcardDeck.length === 0 || currentFlashcardIndex >= currentFlashcardDeck.length) {
        document.getElementById("flashcard-question-text").innerText = "🎉 Deck review completed! Great job.";
        document.getElementById("flashcard-answer-text").innerText = "You have reviewed all available flashcards.";
        document.getElementById("flashcard-counter").innerText = "Completed";
        return;
    }

    const card = currentFlashcardDeck[currentFlashcardIndex];
    document.getElementById("flashcard-question-text").innerText = card.front || "Concept Question";
    document.getElementById("flashcard-answer-text").innerText = card.back || "Answer details";
    document.getElementById("flashcard-counter").innerText = `Card ${currentFlashcardIndex + 1} of ${currentFlashcardDeck.length}`;
}

function flipCurrentFlashcard() {
    const el = document.getElementById("flashcard-element");
    if (el) el.classList.toggle("is-flipped");
}

function speakFlashcardText() {
    if (!currentFlashcardDeck || currentFlashcardDeck.length === 0 || currentFlashcardIndex >= currentFlashcardDeck.length) return;
    const card = currentFlashcardDeck[currentFlashcardIndex];
    const el = document.getElementById("flashcard-element");
    const isFlipped = el && el.classList.contains("is-flipped");
    const textToSpeak = isFlipped ? card.back : card.front;
    
    if ('speechSynthesis' in window && textToSpeak) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(textToSpeak);
        utterance.rate = 1.0;
        window.speechSynthesis.speak(utterance);
    }
}

async function submitFlashcardReviewScore(rating) {
    if (!currentFlashcardDeck || currentFlashcardDeck.length === 0 || currentFlashcardIndex >= currentFlashcardDeck.length) return;
    
    const card = currentFlashcardDeck[currentFlashcardIndex];
    try {
        await fetch(`${API_ROOT}/study/flashcards/review`, {
            method: "POST",
            headers: { 
                "Authorization": `Bearer ${accessToken}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ flashcard_id: card.id, rating })
        });
    } catch (e) {}

    currentFlashcardIndex++;
    renderFlashcardCard();
}


// ------------------- QUIZ GENERATOR & ASSESSOR -------------------
let pendingQuizDocId = null;
let selectedQuizDifficulty = "MEDIUM";

function triggerQuizGen() {
    if (!loadedDocuments || loadedDocuments.length === 0) {
        showPopupMessage("Please upload a study document first to generate an AI quiz.", "warning", "No Document");
        return;
    }
    promptQuizGeneration(loadedDocuments[0].id);
}

function promptQuizGeneration(docId) {
    pendingQuizDocId = docId;
    selectedQuizDifficulty = "MEDIUM";
    
    // Find doc filename
    const targetDoc = (loadedDocuments || []).find(d => String(d.id) === String(docId));
    const titleEl = document.getElementById("quiz-setup-doc-title");
    if (titleEl) {
        titleEl.innerText = targetDoc ? `Target: ${targetDoc.file_name}` : "Select target challenge level";
    }

    setQuizSetupDifficulty("MEDIUM");

    const modalEl = document.getElementById("quizSetupModal");
    if (modalEl) {
        let modal = bootstrap.Modal.getInstance(modalEl);
        if (!modal) modal = new bootstrap.Modal(modalEl);
        modal.show();
    } else {
        generateAndStartQuiz(docId, "MEDIUM");
    }
}

function setQuizSetupDifficulty(diff) {
    selectedQuizDifficulty = diff;
    
    // Update active tier styling
    ["EASY", "MEDIUM", "HARD"].forEach(d => {
        const card = document.getElementById(`diff-card-${d}`);
        const radio = document.getElementById(`radio-diff-${d}`);
        if (card) {
            if (d === diff) {
                card.style.background = d === 'EASY' ? 'rgba(16, 185, 129, 0.12)' : d === 'MEDIUM' ? 'rgba(56, 189, 248, 0.12)' : 'rgba(239, 68, 68, 0.12)';
                card.style.borderColor = d === 'EASY' ? 'rgba(16, 185, 129, 0.5)' : d === 'MEDIUM' ? 'rgba(56, 189, 248, 0.5)' : 'rgba(239, 68, 68, 0.5)';
            } else {
                card.style.background = 'rgba(255, 255, 255, 0.03)';
                card.style.borderColor = 'rgba(255, 255, 255, 0.08)';
            }
        }
        if (radio) {
            radio.checked = (d === diff);
        }
    });
}

function confirmAndLaunchQuiz() {
    const setupModalEl = document.getElementById("quizSetupModal");
    if (setupModalEl) {
        const modal = bootstrap.Modal.getInstance(setupModalEl);
        if (modal) modal.hide();
    }

    const docId = pendingQuizDocId || (loadedDocuments && loadedDocuments.length > 0 ? loadedDocuments[0].id : null);
    if (!docId) {
        showPopupMessage("Please select a document first.", "warning", "Missing Material");
        return;
    }

    generateAndStartQuiz(docId, selectedQuizDifficulty);
}

async function generateAndStartQuiz(docId, difficulty) {
    try {
        const modalEl = document.getElementById("quizModal");
        let modal = bootstrap.Modal.getInstance(modalEl);
        if (!modal) modal = new bootstrap.Modal(modalEl);

        document.getElementById("quiz-taking-container").classList.remove("d-none");
        document.getElementById("quiz-results-container").classList.add("d-none");
        document.getElementById("quiz-question-prompt").innerHTML = `<div class="d-flex align-items-center gap-2 text-info"><span class="spinner-grow spinner-grow-sm text-success"></span> Generating adaptive AI quiz questions with Gemini...</div>`;
        document.getElementById("quiz-options-wrapper").innerHTML = "";
        
        const diffBadge = document.getElementById("quiz-difficulty-badge");
        if (diffBadge) {
            diffBadge.innerText = difficulty;
            diffBadge.className = `badge rounded-pill ${difficulty === 'EASY' ? 'bg-success' : difficulty === 'HARD' ? 'bg-danger' : 'bg-warning text-dark'} px-3 py-1 fw-bold`;
        }
        modal.show();

        const res = await fetch(`${API_ROOT}/study/quizzes/generate?document_id=${docId}&difficulty=${difficulty}`, {
            method: "POST",
            headers: { "Authorization": `Bearer ${accessToken}` }
        });

        if (res.ok) {
            currentQuiz = await res.json();
            currentQuizIndex = 0;
            userQuizAnswers = {};
            renderQuizQuestion();
            showPopupMessage(`Generated ${currentQuiz.questions.length} question ${difficulty} quiz!`, "success", "Quiz Ready");
        } else {
            const errData = await res.json().catch(() => ({}));
            document.getElementById("quiz-question-prompt").innerHTML = `<span class="text-danger">⚠️ ${escapeHtml(errData.message || 'Failed to generate quiz. Please check document contents.')}</span>`;
            showPopupMessage("Quiz generation failed.", "danger", "Quiz Error");
        }
    } catch (e) {
        showPopupMessage("Quiz connection error: " + e.message, "danger", "Network Error");
    }
}


function renderQuizQuestion() {
    if (!currentQuiz || !currentQuiz.questions || currentQuiz.questions.length === 0) return;
    
    const q = currentQuiz.questions[currentQuizIndex];
    document.getElementById("quiz-progress-text").innerText = `Question ${currentQuizIndex + 1} of ${currentQuiz.questions.length}`;
    document.getElementById("quiz-question-prompt").innerText = q.question_text;

    const selectedOpt = userQuizAnswers[q.id];

    const wrapper = document.getElementById("quiz-options-wrapper");
    wrapper.innerHTML = q.options.map((opt, idx) => {
        const label = String.fromCharCode(65 + idx); // A, B, C, D
        const isSelected = selectedOpt === label || selectedOpt === opt;
        return `
            <div class="quiz-option-btn ${isSelected ? 'selected' : ''}" onclick="selectQuizOption('${q.id}', '${label}')">
                <span class="badge bg-primary me-3">${label}</span>
                <span>${opt}</span>
            </div>
        `;
    }).join('');

    // Update nav buttons
    document.getElementById("quiz-prev-btn").disabled = (currentQuizIndex === 0);
    
    if (currentQuizIndex === currentQuiz.questions.length - 1) {
        document.getElementById("quiz-next-btn").classList.add("d-none");
        document.getElementById("quiz-submit-btn").classList.remove("d-none");
    } else {
        document.getElementById("quiz-next-btn").classList.remove("d-none");
        document.getElementById("quiz-submit-btn").classList.add("d-none");
    }
}

function selectQuizOption(questionId, optionLabel) {
    userQuizAnswers[questionId] = optionLabel;
    renderQuizQuestion();
}

function navQuizQuestion(delta) {
    currentQuizIndex += delta;
    if (currentQuizIndex < 0) currentQuizIndex = 0;
    if (currentQuizIndex >= currentQuiz.questions.length) currentQuizIndex = currentQuiz.questions.length - 1;
    renderQuizQuestion();
}

async function submitCurrentQuiz() {
    if (!currentQuiz) return;
    
    try {
        const res = await fetch(`${API_ROOT}/study/quizzes/${currentQuiz.id}/submit`, {
            method: "POST",
            headers: { 
                "Authorization": `Bearer ${accessToken}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ answers: userQuizAnswers })
        });

        if (res.ok) {
            const resultData = await res.json();
            document.getElementById("quiz-taking-container").classList.add("d-none");
            document.getElementById("quiz-results-container").classList.remove("d-none");
            
            const total = resultData.total_questions || currentQuiz.questions.length || 1;
            const pct = Math.round((resultData.score / total) * 100);
            document.getElementById("quiz-final-score-display").innerText = `${resultData.score} / ${total} (${pct}%)`;

            let feedbackHtml = "";
            currentQuiz.questions.forEach((q, idx) => {
                const userKey = userQuizAnswers[q.id] || "Not answered";
                let userText = userKey;
                if (userKey !== "Not answered" && q.options) {
                    const charCode = userKey.charCodeAt(0) - 65;
                    if (charCode >= 0 && charCode < q.options.length) {
                        userText = `${userKey}: ${q.options[charCode]}`;
                    }
                }
                
                feedbackHtml += `
                    <div class="mb-3 pb-2 border-bottom border-secondary">
                        <div class="fw-bold">Q${idx + 1}: ${q.question_text}</div>
                        <div class="small text-secondary mt-1">Your answer: <span class="fw-bold text-info">${userText}</span></div>
                        <div class="small text-success mt-1"><i class="bi bi-info-circle me-1"></i>Explanation: ${q.explanation || 'Reviewed correctly.'}</div>
                    </div>
                `;
            });
            document.getElementById("quiz-feedback-list").innerHTML = feedbackHtml;
        } else {
            const err = await res.json();
            alert(`Quiz Submission Failed: ${err.detail || err.message || 'Server error'}`);
        }
    } catch (e) {
        console.error("Quiz submission error:", e);
        alert("Error submitting quiz responses. Please check network connection.");
    }
}

async function loadWeaknessAnalysis() {
    try {
        const modal = new bootstrap.Modal(document.getElementById("weaknessModal"));
        modal.show();

        const res = await fetch(`${API_ROOT}/study/weakness-analysis`, {
            headers: { "Authorization": `Bearer ${accessToken}` }
        });

        if (res.ok) {
            const data = await res.json();
            let bodyHtml = "";
            if (data.status === "insufficient_data") {
                bodyHtml = `<div class="alert alert-info">${data.message}</div>`;
            } else {
                bodyHtml = `
                    <div class="mb-3">
                        <span class="text-secondary">Average Quiz Score:</span>
                        <h4 class="fw-bold text-primary">${Math.round(data.average_score || 0)}%</h4>
                    </div>
                    <div class="mb-3">
                        <span class="fw-bold text-warning d-block mb-1"><i class="bi bi-exclamation-triangle-fill me-1"></i>Weak Topics:</span>
                        <ul class="mb-2 text-warning">
                            ${(data.weak_topics || []).map(t => `<li>${t}</li>`).join('')}
                        </ul>
                    </div>
                    <div>
                        <span class="fw-bold text-success d-block mb-1"><i class="bi bi-check-circle-fill me-1"></i>Recommended Action Plan:</span>
                        <ul class="text-secondary small">
                            ${(data.study_action_plan || []).map(a => `<li>${a}</li>`).join('')}
                        </ul>
                    </div>
                `;
            }
            document.getElementById("weakness-modal-body").innerHTML = bodyHtml;
        }
    } catch (e) {
        alert("Failed to fetch weakness analysis.");
    }
}

// ------------------- STUDY COMPANION SUB-TABS & ADVANCED FEATURES -------------------
function switchStudySubTab(subTabId) {
    document.querySelectorAll(".study-sub-btn").forEach(btn => btn.classList.remove("active"));
    document.getElementById(`subbtn-${subTabId}`).classList.add("active");

    document.getElementById("study-subpane-workspace").classList.add("d-none");
    document.getElementById("study-subpane-mindmap").classList.add("d-none");
    document.getElementById("study-subpane-planner").classList.add("d-none");

    document.getElementById(`study-subpane-${subTabId}`).classList.remove("d-none");

    if (subTabId === "planner") {
        loadStudyPlannerTab();
    }
}

// =========================================================================
// ------------------- COMPLETE AI MIND MAP VISUALIZER ENGINE -------------------
// =========================================================================

let activeMindMapData = null;
let selectedMindMapNode = null;
let activeMindMapLayout = "tree";
let mindmapZoomScale = 1.0;
let mindmapPanX = 0;
let mindmapPanY = 0;
let isPanDragging = false;
let panStartX = 0;
let panStartY = 0;
let collapsedNodeIds = new Set();
let nodePositions = {};
let searchMatchNodeIds = new Set();

function openCreateMindMapModal() {
    if (!accessToken) {
        silentTokenRefresh().then(() => {
            if (!accessToken) {
                showAuthModal();
                return;
            }
            openCreateMindMapModalAction();
        });
        return;
    }
    openCreateMindMapModalAction();
}

function openCreateMindMapModalAction() {
    populateMindMapDocSelect();
    const modalEl = document.getElementById("createMindMapModal");
    if (!modalEl) return;
    let modal = bootstrap.Modal.getInstance(modalEl);
    if (!modal) modal = new bootstrap.Modal(modalEl);
    modal.show();
}

function populateMindMapDocSelect() {
    const selectEl = document.getElementById("mm-create-doc-select");
    if (!selectEl) return;
    if (loadedDocuments.length === 0) {
        selectEl.innerHTML = `<option value="">No loaded documents available. Upload one first.</option>`;
    } else {
        selectEl.innerHTML = loadedDocuments.map(d => `<option value="${d.id}">${escapeHtml(d.file_name)}</option>`).join('');
    }
}

function toggleMindMapSourceInputs(sourceType) {
    document.getElementById("mm-input-sec-topic").classList.toggle("d-none", sourceType !== "TOPIC");
    document.getElementById("mm-input-sec-text").classList.toggle("d-none", sourceType !== "TEXT");
    document.getElementById("mm-input-sec-file").classList.toggle("d-none", sourceType !== "FILE");
    document.getElementById("mm-input-sec-doc").classList.toggle("d-none", sourceType !== "NOTE");
}

async function executeCreateMindMapForm() {
    const sourceRadio = document.querySelector('input[name="mm_source"]:checked');
    const sourceType = sourceRadio ? sourceRadio.value : "TOPIC";
    
    let topicVal = "";
    let textVal = "";
    let docIdVal = null;

    if (sourceType === "TOPIC") {
        topicVal = document.getElementById("mm-create-topic-input").value.trim();
        if (!topicVal) {
            alert("Please enter a topic title.");
            return;
        }
    } else if (sourceType === "TEXT") {
        textVal = document.getElementById("mm-create-text-input").value.trim();
        if (!textVal) {
            alert("Please paste study material text.");
            return;
        }
        topicVal = "Pasted Study Material";
    } else if (sourceType === "FILE") {
        const fileInput = document.getElementById("mm-create-file-input");
        if (!fileInput.files || fileInput.files.length === 0) {
            alert("Please select a file to upload.");
            return;
        }
        const uploadedDoc = await uploadFileForMindMap(fileInput.files[0]);
        if (!uploadedDoc) return;
        docIdVal = uploadedDoc.id;
        topicVal = uploadedDoc.file_name;
    } else if (sourceType === "NOTE") {
        const selectEl = document.getElementById("mm-create-doc-select");
        docIdVal = selectEl.value;
        if (!docIdVal) {
            alert("Please select a saved document.");
            return;
        }
        const found = loadedDocuments.find(d => d.id === docIdVal);
        topicVal = found ? found.file_name : "Selected Document";
    }

    try {
        const modalEl = document.getElementById("createMindMapModal");
        if (modalEl) {
            let modal = bootstrap.Modal.getInstance(modalEl);
            if (modal) modal.hide();
        }
    } catch (e) {
        console.warn("Modal hide note:", e);
    }

    await generateMindMapUIFull(sourceType, topicVal, textVal, docIdVal);
}

async function uploadFileForMindMap(file) {
    showMindMapLoading(true, "Uploading & parsing document file...");
    const formData = new FormData();
    formData.append("file", file);

    try {
        const res = await fetch(`${API_ROOT}/study/upload`, {
            method: "POST",
            headers: { "Authorization": `Bearer ${accessToken}` },
            body: formData
        });
        if (res.ok) {
            const doc = await res.json();
            if (!loadedDocuments.some(d => d.id === doc.id)) {
                loadedDocuments.unshift(doc);
                renderProcessedDocsList();
            }
            return doc;
        } else {
            alert("Failed to upload document file.");
        }
    } catch (e) {
        alert("Document upload error.");
    } finally {
        showMindMapLoading(false);
    }
    return null;
}

async function generateMindmapUI() {
    const topicInput = document.getElementById("mindmap-topic-input");
    const topic = topicInput ? topicInput.value.trim() : "";
    if (topic) {
        await generateMindMapUIFull("TOPIC", topic, "", null);
    } else {
        openCreateMindMapModal();
    }
}

async function generateMindMapUIFull(sourceType, topic, text, docId) {
    if (!accessToken) {
        await silentTokenRefresh();
        if (!accessToken) {
            showAuthModal();
            return;
        }
    }

    showMindMapLoading(true, "Analyzing content...");
    
    setTimeout(() => updateMindMapLoadingText("Extracting concepts..."), 600);
    setTimeout(() => updateMindMapLoadingText("Finding relationships & building concept hierarchy..."), 1200);
    setTimeout(() => updateMindMapLoadingText("Calculating student mastery & generating visual map..."), 1800);

    try {
        const res = await fetch(`${API_ROOT}/study/mindmaps/generate`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${accessToken}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                source_type: sourceType || "TOPIC",
                topic: topic || "Study Topic",
                text: text || null,
                document_id: docId || null
            })
        });

        if (res.ok) {
            activeMindMapData = await res.json();
            collapsedNodeIds.clear();
            mindmapZoomScale = 1.0;
            mindmapPanX = 0;
            mindmapPanY = 0;
            
            if (activeMindMapData.nodes && activeMindMapData.nodes.length > 0) {
                selectedMindMapNode = activeMindMapData.nodes[0];
                populateConceptSidePanel(selectedMindMapNode);
            } else {
                selectedMindMapNode = null;
            }

            document.getElementById("mindmap-active-title").innerText = activeMindMapData.title || `Mind Map - ${topic}`;
            document.getElementById("mm-empty-state").classList.add("d-none");
            
            updateMindMapLearningOverviewStats();
            renderMindMapCanvas();
        } else {
            const errJson = await res.json().catch(() => ({}));
            const msg = errJson.detail ? (typeof errJson.detail === 'string' ? errJson.detail : JSON.stringify(errJson.detail)) : "Failed to generate mind map.";
            alert(`Mind Map Generation Alert: ${msg}`);
        }
    } catch (e) {
        console.error("Mind map generation error:", e);
        alert("Error generating mind map. Connection or server issue.");
    } finally {
        showMindMapLoading(false);
    }
}

function showMindMapLoading(show, text = "Analyzing content...") {
    const overlay = document.getElementById("mm-loading-overlay");
    const statusText = document.getElementById("mm-loading-status-text");
    if (!overlay) return;
    if (show) {
        if (statusText) statusText.innerText = text;
        overlay.classList.remove("d-none");
    } else {
        overlay.classList.add("d-none");
    }
}

function updateMindMapLoadingText(text) {
    const statusText = document.getElementById("mm-loading-status-text");
    if (statusText) statusText.innerText = text;
}

// ------------------- MIND MAP CANVAS LAYOUT & RENDER -------------------

function changeMindMapLayout(layout) {
    activeMindMapLayout = layout;
    renderMindMapCanvas();
}

function renderMindMapCanvas() {
    const emptyEl = document.getElementById("mm-empty-state");
    if (!activeMindMapData || !activeMindMapData.nodes || activeMindMapData.nodes.length === 0) {
        if (emptyEl) {
            emptyEl.classList.remove("d-none");
            emptyEl.style.display = "flex";
        }
        return;
    }

    if (emptyEl) {
        emptyEl.classList.add("d-none");
        emptyEl.style.display = "none";
    }

    calculateNodePositions(activeMindMapData.nodes, activeMindMapLayout);
    drawMindMapSVG();
}

function getNodeBoxWidth(n) {
    const isRoot = !n.parent_id || n.id === "root";
    return Math.max(160, (n.name || "").length * 9.5 + (isRoot ? 50 : 44));
}

function calculateNodePositions(nodes, layout) {
    nodePositions = {};
    if (!nodes || nodes.length === 0) return;

    const nodeMap = {};
    nodes.forEach(n => {
        nodeMap[n.id] = n;
        n._children = [];
    });

    const rootNodes = [];
    nodes.forEach(n => {
        if (n.parent_id && nodeMap[n.parent_id]) {
            nodeMap[n.parent_id]._children.push(n);
        } else {
            rootNodes.push(n);
        }
    });

    if (layout === "tree" || layout === "vertical") {
        // Recursive Subtree Bounding Calculations
        const GAP = 40;
        function computeSubtreeWidth(n) {
            const myWidth = getNodeBoxWidth(n);
            if (!n._children || n._children.length === 0) {
                n._subtreeWidth = myWidth;
                return myWidth;
            }
            let childrenWidth = 0;
            n._children.forEach((child, idx) => {
                childrenWidth += computeSubtreeWidth(child);
                if (idx > 0) childrenWidth += GAP;
            });
            n._subtreeWidth = Math.max(myWidth, childrenWidth);
            return n._subtreeWidth;
        }

        let totalForestWidth = 0;
        rootNodes.forEach((root, idx) => {
            totalForestWidth += computeSubtreeWidth(root);
            if (idx > 0) totalForestWidth += 80;
        });

        // Pre-order Positioning: place children under parent with zero overlap
        function positionNode(n, leftX, level) {
            const y = 90 + level * 160;
            if (!n._children || n._children.length === 0) {
                nodePositions[n.id] = { x: leftX + n._subtreeWidth / 2, y };
                return;
            }

            const childrenSpan = n._children.reduce((acc, c) => acc + c._subtreeWidth, 0) + (n._children.length - 1) * GAP;
            let currX = leftX + (n._subtreeWidth - childrenSpan) / 2;

            n._children.forEach(child => {
                positionNode(child, currX, level + 1);
                currX += child._subtreeWidth + GAP;
            });

            const firstChildPos = nodePositions[n._children[0].id];
            const lastChildPos = nodePositions[n._children[n._children.length - 1].id];
            const parentX = (firstChildPos.x + lastChildPos.x) / 2;
            nodePositions[n.id] = { x: parentX, y };
        }

        let startLeft = 500 - totalForestWidth / 2;
        rootNodes.forEach(root => {
            positionNode(root, startLeft, 0);
            startLeft += root._subtreeWidth + 80;
        });

    } else if (layout === "horizontal" || layout === "flow") {
        const GAP_Y = 32;
        function computeSubtreeHeight(n) {
            const myHeight = 55;
            if (!n._children || n._children.length === 0) {
                n._subtreeHeight = myHeight;
                return myHeight;
            }
            let childrenHeight = 0;
            n._children.forEach((child, idx) => {
                childrenHeight += computeSubtreeHeight(child);
                if (idx > 0) childrenHeight += GAP_Y;
            });
            n._subtreeHeight = Math.max(myHeight, childrenHeight);
            return n._subtreeHeight;
        }

        let totalForestHeight = 0;
        rootNodes.forEach((root, idx) => {
            totalForestHeight += computeSubtreeHeight(root);
            if (idx > 0) totalForestHeight += 60;
        });

        function positionHorizontalNode(n, topY, level) {
            const x = 120 + level * 300;
            if (!n._children || n._children.length === 0) {
                nodePositions[n.id] = { x, y: topY + n._subtreeHeight / 2 };
                return;
            }

            const childrenSpan = n._children.reduce((acc, c) => acc + c._subtreeHeight, 0) + (n._children.length - 1) * GAP_Y;
            let currY = topY + (n._subtreeHeight - childrenSpan) / 2;

            n._children.forEach(child => {
                positionHorizontalNode(child, currY, level + 1);
                currY += child._subtreeHeight + GAP_Y;
            });

            const firstChildPos = nodePositions[n._children[0].id];
            const lastChildPos = nodePositions[n._children[n._children.length - 1].id];
            const parentY = (firstChildPos.y + lastChildPos.y) / 2;
            nodePositions[n.id] = { x, y: parentY };
        }

        let startTop = 300 - totalForestHeight / 2;
        rootNodes.forEach(root => {
            positionHorizontalNode(root, startTop, 0);
            startTop += root._subtreeHeight + 60;
        });

    } else if (layout === "radial") {
        const root = rootNodes[0] || nodes[0];
        nodePositions[root.id] = { x: 500, y: 350 };

        function getLevel(n) {
            if (!n.parent_id || !nodeMap[n.parent_id]) return 0;
            return 1 + getLevel(nodeMap[n.parent_id]);
        }

        const levels = {};
        nodes.forEach(n => {
            const lvl = getLevel(n);
            if (!levels[lvl]) levels[lvl] = [];
            levels[lvl].push(n);
        });

        Object.keys(levels).forEach(lvlStr => {
            const lvl = Number(lvlStr);
            if (lvl === 0) return;
            const lvlNodes = levels[lvl];
            const radius = lvl * 220;
            const angleStep = (2 * Math.PI) / Math.max(1, lvlNodes.length);

            lvlNodes.forEach((n, idx) => {
                const angle = idx * angleStep;
                const x = 500 + radius * Math.cos(angle);
                const y = 350 + radius * Math.sin(angle);
                nodePositions[n.id] = { x, y };
            });
        });
    }
}


function drawMindMapSVG() {
    const linksLayer = document.getElementById("mindmap-links-layer");
    const nodesLayer = document.getElementById("mindmap-nodes-layer");
    const viewport = document.getElementById("mindmap-viewport");
    
    if (!linksLayer || !nodesLayer || !viewport) return;

    viewport.setAttribute("transform", `translate(${mindmapPanX}, ${mindmapPanY}) scale(${mindmapZoomScale})`);

    const nodes = activeMindMapData.nodes || [];
    const relationships = activeMindMapData.relationships || [];

    const visibleNodeIds = new Set();
    function checkVisibility(node) {
        if (!node.parent_id) return true;
        let curr = activeMindMapData.nodes.find(n => n.id === node.parent_id);
        while (curr) {
            if (collapsedNodeIds.has(curr.id)) return false;
            curr = activeMindMapData.nodes.find(n => n.id === curr.parent_id);
        }
        return true;
    }

    nodes.forEach(n => {
        if (checkVisibility(n)) visibleNodeIds.add(n.id);
    });

    let linksHtml = "";
    
    nodes.forEach(n => {
        if (n.parent_id && visibleNodeIds.has(n.id) && visibleNodeIds.has(n.parent_id)) {
            const pPos = nodePositions[n.parent_id];
            const cPos = nodePositions[n.id];
            if (pPos && cPos) {
                const pathData = `M ${pPos.x} ${pPos.y} Q ${(pPos.x + cPos.x)/2} ${pPos.y} ${cPos.x} ${cPos.y}`;
                linksHtml += `
                    <path d="${pathData}" stroke="rgba(99, 102, 241, 0.25)" stroke-width="4.5" fill="none" />
                    <path d="${pathData}" class="mm-laser-beam" stroke="url(#mm-beam-pulse)" stroke-width="2.5" fill="none" marker-end="url(#arrow-parent)" />
                `;
            }
        }
    });

    relationships.forEach(rel => {
        if (rel.type !== "Parent-Child" && visibleNodeIds.has(rel.from) && visibleNodeIds.has(rel.to)) {
            const fPos = nodePositions[rel.from];
            const tPos = nodePositions[rel.to];
            if (fPos && tPos) {
                const strokeColor = rel.type === "Depends On" ? "#ef4444" : "#06b6d4";
                const marker = rel.type === "Depends On" ? "arrow-depends" : "arrow-related";
                const pathData = `M ${fPos.x} ${fPos.y} L ${tPos.x} ${tPos.y}`;
                linksHtml += `<path d="${pathData}" class="mm-laser-beam" stroke="${strokeColor}" stroke-dasharray="6,4" stroke-width="2.5" fill="none" marker-end="url(#${marker})" />`;
            }
        }
    });

    linksLayer.innerHTML = linksHtml;

    let nodesHtml = "";

    nodes.forEach(n => {
        if (!visibleNodeIds.has(n.id)) return;
        const pos = nodePositions[n.id] || { x: 400, y: 300 };
        const isRoot = !n.parent_id;
        const isSelected = selectedMindMapNode && selectedMindMapNode.id === n.id;
        const isSearchMatch = searchMatchNodeIds.has(n.id);
        const hasChildren = nodes.some(child => child.parent_id === n.id);
        const isCollapsed = collapsedNodeIds.has(n.id);

        let badgeColor = "#06b6d4";
        if (n.importance === "High") badgeColor = "#ef4444";
        else if (n.importance === "Medium") badgeColor = "#f59e0b";

        let strokeColor = isSelected ? "#818cf8" : (isRoot ? "#38bdf8" : (isSearchMatch ? "#f59e0b" : "rgba(255,255,255,0.22)"));
        let strokeWidth = isSelected || isRoot ? "2.8" : (isSearchMatch ? "3.5" : "1.5");
        let fillGrad = isRoot ? "url(#mm-grad-root)" : (isSelected ? "url(#mm-grad-selected)" : "url(#mm-grad-node)");
        let filterEffect = isRoot ? 'filter="url(#mm-root-3d-glow)"' : (isSelected ? 'filter="url(#mm-node-3d-glow)"' : 'filter="drop-shadow(0px 8px 18px rgba(0,0,0,0.6))"');
        
        if (n.status === "Needs Revision") {
            strokeColor = "#ef4444";
            strokeWidth = "3";
        }

        const rectWidth = Math.max(140, n.name.length * 9.5 + 44);
        const rectHeight = isRoot ? 50 : 44;
        const rectX = pos.x - rectWidth / 2;
        const rectY = pos.y - rectHeight / 2;

        const masteryLabel = (n.mastery !== null && n.mastery !== undefined) ? `${n.mastery}%` : "";

        nodesHtml += `
            <g class="mindmap-node-group ${isRoot ? 'mm-root-pulse' : ''}" style="cursor: pointer;" onclick="onMindMapNodeClick('${n.id}', event)">
                <rect x="${rectX}" y="${rectY}" width="${rectWidth}" height="${rectHeight}" rx="${isRoot ? 16 : 12}"
                      fill="${fillGrad}" stroke="${strokeColor}" stroke-width="${strokeWidth}"
                      ${filterEffect} />
                
                <circle cx="${rectX + 16}" cy="${pos.y}" r="${isRoot ? 6 : 5}" fill="${badgeColor}" />

                <text x="${rectX + 28}" y="${pos.y + 4}" fill="#ffffff" font-size="${isRoot ? 14 : 13}" font-weight="${isRoot ? 800 : 600}" font-family="sans-serif">
                    ${escapeHtml(n.name)}
                </text>

                ${masteryLabel ? `
                    <text x="${rectX + rectWidth - 12}" y="${pos.y + 4}" text-anchor="end" fill="#38bdf8" font-size="11" font-weight="700">
                        ${masteryLabel}
                    </text>
                ` : ''}

                ${hasChildren ? `
                    <circle cx="${pos.x}" cy="${rectY + rectHeight + 6}" r="10" fill="#1e1b4b" stroke="#818cf8" stroke-width="1.8"
                            onclick="toggleCollapseNode('${n.id}', event)" filter="drop-shadow(0 2px 5px rgba(0,0,0,0.5))" />
                    <text x="${pos.x}" y="${rectY + rectHeight + 10}" text-anchor="middle" fill="#ffffff" font-size="12" font-weight="bold" pointer-events="none">
                        ${isCollapsed ? '+' : '−'}
                    </text>
                ` : ''}
            </g>
        `;
    });

    nodesLayer.innerHTML = nodesHtml;
    setupCanvasPanListeners();
}

function setupCanvasPanListeners() {
    const container = document.getElementById("mindmap-canvas-container");
    if (!container || container.dataset.panSetup) return;
    container.dataset.panSetup = "true";

    container.addEventListener("mousedown", (e) => {
        if (e.target.closest(".mindmap-node-group")) return;
        isPanDragging = true;
        panStartX = e.clientX - mindmapPanX;
        panStartY = e.clientY - mindmapPanY;
        container.style.cursor = "grabbing";
    });

    window.addEventListener("mousemove", (e) => {
        if (!isPanDragging) return;
        mindmapPanX = e.clientX - panStartX;
        mindmapPanY = e.clientY - panStartY;
        drawMindMapSVG();
    });

    window.addEventListener("mouseup", () => {
        if (isPanDragging) {
            isPanDragging = false;
            const container = document.getElementById("mindmap-canvas-container");
            if (container) container.style.cursor = "grab";
        }
    });

    container.addEventListener("wheel", (e) => {
        e.preventDefault();
        const delta = e.deltaY < 0 ? 0.1 : -0.1;
        mindmapCanvasZoom(delta);
    }, { passive: false });
}

function mindmapCanvasZoom(delta) {
    mindmapZoomScale += delta;
    if (mindmapZoomScale < 0.3) mindmapZoomScale = 0.3;
    if (mindmapZoomScale > 2.5) mindmapZoomScale = 2.5;
    drawMindMapSVG();
}

function mindmapCanvasReset() {
    mindmapZoomScale = 1.0;
    mindmapPanX = 0;
    mindmapPanY = 0;
    drawMindMapSVG();
}

function mindmapCanvasFit() {
    const container = document.getElementById("mindmap-canvas-container");
    if (!container || !nodePositions || Object.keys(nodePositions).length === 0) {
        mindmapZoomScale = 0.9;
        mindmapPanX = 50;
        mindmapPanY = 40;
        drawMindMapSVG();
        return;
    }

    const cWidth = container.clientWidth || 800;
    const cHeight = container.clientHeight || 600;

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    Object.values(nodePositions).forEach(pos => {
        if (pos.x < minX) minX = pos.x;
        if (pos.x > maxX) maxX = pos.x;
        if (pos.y < minY) minY = pos.y;
        if (pos.y > maxY) maxY = pos.y;
    });

    const pad = 120;
    minX -= pad; maxX += pad;
    minY -= pad; maxY += pad;

    const mapWidth = Math.max(200, maxX - minX);
    const mapHeight = Math.max(200, maxY - minY);

    const scaleX = (cWidth - 60) / mapWidth;
    const scaleY = (cHeight - 60) / mapHeight;
    let targetScale = Math.min(scaleX, scaleY, 1.15);
    if (targetScale < 0.35) targetScale = 0.35;

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    mindmapZoomScale = parseFloat(targetScale.toFixed(2));
    mindmapPanX = Math.round(cWidth / 2 - centerX * mindmapZoomScale);
    mindmapPanY = Math.round(cHeight / 2 - centerY * mindmapZoomScale);

    drawMindMapSVG();
}


function toggleMindMapFullscreen() {
    const wrapper = document.getElementById("mindmap-fullscreen-wrapper");
    if (!wrapper) return;

    const isFull = wrapper.classList.contains("is-fullscreen");
    const btn = document.getElementById("mm-fullscreen-btn");
    const mainRow = document.getElementById("mm-main-row");
    const canvasCont = document.getElementById("mindmap-canvas-container");
    const sidePanel = document.getElementById("mm-concept-side-panel");

    if (!isFull) {
        wrapper.classList.add("is-fullscreen");
        if (mainRow) mainRow.style.cssText = "height: calc(100vh - 85px) !important; max-height: calc(100vh - 85px) !important; flex: 1 1 0% !important; margin: 0 !important; display: flex !important;";
        if (canvasCont) canvasCont.style.cssText = "height: 100% !important; max-height: 100% !important; flex: 1 1 auto !important;";
        if (sidePanel) sidePanel.style.cssText = "height: 100% !important; max-height: 100% !important;";

        if (btn) {
            btn.innerHTML = `✕ Exit Fullscreen`;
            btn.className = "btn btn-danger";
        }
        showPopupMessage("Mind Map entered full screen. Press ESC or click Exit to return.", "info", "Full Screen Active");

        if (wrapper.requestFullscreen) {
            wrapper.requestFullscreen().catch(() => {});
        }
    } else {
        wrapper.classList.remove("is-fullscreen");
        if (mainRow) mainRow.style.cssText = "";
        if (canvasCont) canvasCont.style.cssText = "";
        if (sidePanel) sidePanel.style.cssText = "";

        if (btn) {
            btn.innerHTML = `⛶ Fullscreen`;
            btn.className = "btn btn-outline-primary";
        }
        if (document.fullscreenElement) {
            document.exitFullscreen().catch(() => {});
        }
    }

    setTimeout(() => {
        mindmapCanvasFit();
    }, 150);
}

// ESC listener for fullscreen exit
document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
        const wrapper = document.getElementById("mindmap-fullscreen-wrapper");
        if (wrapper && wrapper.classList.contains("is-fullscreen")) {
            toggleMindMapFullscreen();
        }
    }
});

document.addEventListener("fullscreenchange", () => {
    const wrapper = document.getElementById("mindmap-fullscreen-wrapper");
    const btn = document.getElementById("mm-fullscreen-btn");
    const mainRow = document.getElementById("mm-main-row");
    const canvasCont = document.getElementById("mindmap-canvas-container");
    const sidePanel = document.getElementById("mm-concept-side-panel");

    if (!document.fullscreenElement && wrapper && wrapper.classList.contains("is-fullscreen")) {
        wrapper.classList.remove("is-fullscreen");
        if (mainRow) mainRow.style.cssText = "";
        if (canvasCont) canvasCont.style.cssText = "";
        if (sidePanel) sidePanel.style.cssText = "";

        if (btn) {
            btn.innerHTML = `⛶ Fullscreen`;
            btn.className = "btn btn-outline-primary";
        }
        setTimeout(() => {
            mindmapCanvasFit();
        }, 150);
    }
});



function toggleCollapseNode(nodeId, event) {
    if (event) event.stopPropagation();
    if (collapsedNodeIds.has(nodeId)) {
        collapsedNodeIds.delete(nodeId);
    } else {
        collapsedNodeIds.add(nodeId);
    }
    renderMindMapCanvas();
}

// ------------------- NODE CLICK & SIDE PANEL -------------------

function onMindMapNodeClick(nodeId, event) {
    if (event) event.stopPropagation();
    const node = (activeMindMapData.nodes || []).find(n => n.id === nodeId);
    if (!node) return;

    selectedMindMapNode = node;
    drawMindMapSVG();
    populateConceptSidePanel(node);
}

function populateConceptSidePanel(node) {
    document.getElementById("mm-panel-unselected").classList.add("d-none");
    document.getElementById("mm-panel-selected").classList.remove("d-none");

    document.getElementById("mm-concept-title").innerText = node.name;
    document.getElementById("mm-concept-definition").innerText = node.definition || "No definition available.";
    document.getElementById("mm-concept-explanation").innerText = node.detailed_explanation || "No detailed explanation.";
    document.getElementById("mm-concept-importance-select").value = node.importance || "Medium";

    const statusBadge = document.getElementById("mm-concept-status-badge");
    const masteryText = document.getElementById("mm-concept-mastery-text");
    const masteryBar = document.getElementById("mm-concept-mastery-bar");
    const weakAlert = document.getElementById("mm-weak-concept-alert");

    if (node.mastery !== null && node.mastery !== undefined) {
        masteryText.innerText = `${node.mastery}%`;
        masteryBar.style.width = `${node.mastery}%`;
        if (node.mastery < 60) {
            statusBadge.className = "badge bg-danger";
            statusBadge.innerText = "Needs Revision";
            weakAlert.classList.remove("d-none");
        } else {
            statusBadge.className = "badge bg-success";
            statusBadge.innerText = "Mastered";
            weakAlert.classList.add("d-none");
        }
    } else {
        masteryText.innerText = "Not enough data";
        masteryBar.style.width = "0%";
        statusBadge.className = "badge bg-secondary";
        statusBadge.innerText = "Learning";
        weakAlert.classList.add("d-none");
    }

    const relatedTags = document.getElementById("mm-concept-related-tags");
    if (node.related && node.related.length > 0) {
        relatedTags.innerHTML = node.related.map(r => `
            <span class="badge bg-secondary text-info" style="cursor: pointer;" onclick="focusMindMapNodeByName('${escapeHtml(r)}')">${escapeHtml(r)}</span>
        `).join('');
    } else {
        relatedTags.innerHTML = `<span class="text-secondary small">None specified</span>`;
    }
}

function focusMindMapNodeByName(name) {
    const node = (activeMindMapData.nodes || []).find(n => n.name.toLowerCase() === name.toLowerCase());
    if (node) {
        onMindMapNodeClick(node.id);
        const pos = nodePositions[node.id];
        if (pos) {
            mindmapPanX = 400 - pos.x * mindmapZoomScale;
            mindmapPanY = 300 - pos.y * mindmapZoomScale;
            drawMindMapSVG();
        }
    }
}

function updateSelectedNodeImportance(newImportance) {
    if (!selectedMindMapNode) return;
    selectedMindMapNode.importance = newImportance;
    renderMindMapCanvas();
}

function onMindMapSearchInput(event) {
    const query = event.target.value.trim().toLowerCase();
    searchMatchNodeIds.clear();

    if (query) {
        (activeMindMapData.nodes || []).forEach(n => {
            if (n.name.toLowerCase().includes(query) || (n.definition && n.definition.toLowerCase().includes(query))) {
                searchMatchNodeIds.add(n.id);
            }
        });
        if (searchMatchNodeIds.size > 0) {
            const firstId = Array.from(searchMatchNodeIds)[0];
            const pos = nodePositions[firstId];
            if (pos) {
                mindmapPanX = 400 - pos.x * mindmapZoomScale;
                mindmapPanY = 300 - pos.y * mindmapZoomScale;
            }
        }
    }
    renderMindMapCanvas();
}

// ------------------- AI ACTIONS ON SELECTED NODE -------------------

async function executeNodeAIExplainUI() {
    if (!selectedMindMapNode) return;
    const mode = document.getElementById("mm-explain-mode-select").value;
    const expDiv = document.getElementById("mm-concept-explanation");
    expDiv.innerText = `Generating ${mode} with Gemini AI...`;

    try {
        const res = await fetch(`${API_ROOT}/study/mindmaps/explain-node`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${accessToken}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                concept_name: selectedMindMapNode.name,
                mode: mode,
                context: selectedMindMapNode.detailed_explanation
            })
        });

        if (res.ok) {
            const data = await res.json();
            expDiv.innerText = data.explanation;
            selectedMindMapNode.detailed_explanation = data.explanation;
        } else {
            expDiv.innerText = "Failed to generate explanation.";
        }
    } catch (e) {
        expDiv.innerText = "Error generating AI explanation.";
    }
}

async function executeNodeAIExpandUI() {
    if (!selectedMindMapNode) return;
    showMindMapLoading(true, `Expanding concept '${selectedMindMapNode.name}' with AI...`);

    try {
        const res = await fetch(`${API_ROOT}/study/mindmaps/expand-node`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${accessToken}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                concept_name: selectedMindMapNode.name,
                parent_context: selectedMindMapNode.definition
            })
        });

        if (res.ok) {
            const data = await res.json();
            const subNodes = data.sub_nodes || [];
            
            subNodes.forEach((sn, idx) => {
                const childId = `ext-${selectedMindMapNode.id}-${Date.now()}-${idx}`;
                activeMindMapData.nodes.push({
                    id: childId,
                    name: sn.name,
                    definition: sn.definition,
                    detailed_explanation: sn.detailed_explanation,
                    importance: sn.importance || "Medium",
                    parent_id: selectedMindMapNode.id,
                    related: [selectedMindMapNode.name],
                    mastery: null,
                    status: "Learning"
                });
                activeMindMapData.relationships.push({
                    from: selectedMindMapNode.id,
                    to: childId,
                    type: "Parent-Child"
                });
            });

            collapsedNodeIds.delete(selectedMindMapNode.id);
            updateMindMapLearningOverviewStats();
            renderMindMapCanvas();
        } else {
            alert("Failed to expand concept node.");
        }
    } catch (e) {
        alert("Error expanding concept node.");
    } finally {
        showMindMapLoading(false);
    }
}

async function generateMindmapUI() {
    const input = document.getElementById("mindmap-topic-input");
    const rawVal = (input && input.value.trim()) ? input.value.trim() : "Machine Learning";
    
    if (rawVal.includes("\n") || rawVal.length > 60) {
        showMindMapLoading(true, "Extracting concept map from pasted study material...");
        const lines = rawVal.split("\n").map(l => l.trim()).filter(l => l.length > 0);
        const topicName = lines.length > 0 ? lines[0].slice(0, 45).replace(/^[#\*0-9\.\-\:]+/, "").trim() : "Study Material";
        
        try {
            const res = await fetch(`${API_ROOT}/study/mindmaps/generate`, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${accessToken}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    source_type: "TEXT",
                    topic: topicName,
                    text: rawVal
                })
            });

            if (res.ok) {
                const data = await res.json();
                activeMindMapData = data;
                activeMindMapLayout = data.layout_type || "tree";

                const titleEl = document.getElementById("mindmap-active-title");
                if (titleEl) titleEl.innerText = data.title || `Mind Map — ${topicName}`;

                const emptyEl = document.getElementById("mm-empty-state");
                if (emptyEl) emptyEl.classList.add("d-none");

                updateMindMapLearningOverviewStats();
                renderMindMapCanvas();
                mindmapCanvasFit();
                return;
            }
        } catch (e) {
            console.error("Text mindmap error:", e);
        } finally {
            showMindMapLoading(false);
        }
    }

    await generateMindmapFromTopic(rawVal);
}

async function generateMindmapFromTopic(topic) {
    if (!topic || !topic.trim()) {
        alert("Please enter a topic to generate a mind map.");
        return;
    }

    showMindMapLoading(true, `Generating AI Concept Mind Map for "${topic}"...`);
    
    try {
        const res = await fetch(`${API_ROOT}/study/mindmaps/generate`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${accessToken}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                source_type: "TOPIC",
                topic: topic
            })
        });

        if (res.ok) {
            const data = await res.json();
            activeMindMapData = data;
            activeMindMapLayout = data.layout_type || "tree";
            
            const titleEl = document.getElementById("mindmap-active-title");
            if (titleEl) titleEl.innerText = data.title || `Mind Map — ${topic}`;

            const emptyEl = document.getElementById("mm-empty-state");
            if (emptyEl) emptyEl.classList.add("d-none");

            updateMindMapLearningOverviewStats();
            renderMindMapCanvas();
            mindmapCanvasFit();
        } else {
            alert("Failed to generate mind map. Please check your topic and try again.");
        }
    } catch (e) {
        console.error("Mindmap generate error:", e);
        alert("Error connecting to mind map generator.");
    } finally {
        showMindMapLoading(false);
    }
}

async function openCreateMindMapModal() {
    const selectEl = document.getElementById("mm-create-doc-select");
    if (selectEl) {
        if (loadedDocuments && loadedDocuments.length > 0) {
            selectEl.innerHTML = loadedDocuments.map(d => `<option value="${d.id}">${escapeHtml(d.file_name)}</option>`).join('');
        } else {
            selectEl.innerHTML = `<option value="">No loaded documents available. Upload a file first.</option>`;
        }
    }
    const modalEl = document.getElementById("createMindMapModal");
    if (modalEl) {
        const modal = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
        modal.show();
    }
}

function toggleMindMapSourceInputs(type) {
    const secTopic = document.getElementById("mm-input-sec-topic");
    const secText = document.getElementById("mm-input-sec-text");
    const secFile = document.getElementById("mm-input-sec-file");
    const secDoc = document.getElementById("mm-input-sec-doc");

    if (secTopic) secTopic.classList.toggle("d-none", type !== "TOPIC");
    if (secText) secText.classList.toggle("d-none", type !== "TEXT");
    if (secFile) secFile.classList.toggle("d-none", type !== "FILE");
    if (secDoc) secDoc.classList.toggle("d-none", type !== "NOTE");
}

async function executeCreateMindMapForm() {
    const modalEl = document.getElementById("createMindMapModal");
    const modal = modalEl ? bootstrap.Modal.getInstance(modalEl) : null;
    
    const selectedRadio = document.querySelector('input[name="mm_source"]:checked');
    const sourceType = selectedRadio ? selectedRadio.value : "TOPIC";

    let topic = "";
    let text = "";
    let docId = null;

    if (sourceType === "TOPIC") {
        const topicIn = document.getElementById("mm-create-topic-input");
        topic = (topicIn && topicIn.value.trim()) ? topicIn.value.trim() : "Core Study Topic";
    } else if (sourceType === "TEXT") {
        const textIn = document.getElementById("mm-create-text-input");
        text = textIn ? textIn.value.trim() : "";
        if (!text) {
            alert("Please paste text material to generate mind map.");
            return;
        }
        const lines = text.split("\n").map(l => l.trim()).filter(l => l.length > 0);
        topic = lines.length > 0 ? lines[0].slice(0, 45).replace(/^[#\*0-9\.\-\:]+/, "").trim() : "Study Text Material";
    } else if (sourceType === "FILE") {
        const fileIn = document.getElementById("mm-create-file-input");
        const file = fileIn ? fileIn.files[0] : null;
        if (!file) {
            alert("Please select a PDF or document file to upload.");
            return;
        }
        
        if (modal) modal.hide();
        showMindMapLoading(true, `Uploading & Extracting concepts from "${file.name}"...`);

        try {
            const formData = new FormData();
            formData.append("file", file);
            const uploadRes = await fetch(`${API_ROOT}/study/upload`, {
                method: "POST",
                headers: { "Authorization": `Bearer ${accessToken}` },
                body: formData
            });

            if (uploadRes.ok) {
                const docData = await uploadRes.json();
                docId = docData.id;
                text = docData.extracted_text || "";
                topic = docData.file_name ? docData.file_name.replace(/\.[^/.]+$/, "") : file.name;
                
                // Add to local loaded documents array
                if (!loadedDocuments.some(d => d.id === docData.id)) {
                    loadedDocuments.push(docData);
                }
            } else {
                alert("Failed to process PDF file.");
                showMindMapLoading(false);
                return;
            }
        } catch (err) {
            console.error("PDF upload error:", err);
            alert("Error uploading PDF file.");
            showMindMapLoading(false);
            return;
        }
    } else if (sourceType === "NOTE") {
        const docSelect = document.getElementById("mm-create-doc-select");
        docId = docSelect ? docSelect.value : null;
        if (!docId) {
            alert("Please select a study document.");
            return;
        }
        const docObj = (loadedDocuments || []).find(d => String(d.id) === String(docId));
        if (docObj) {
            topic = docObj.file_name ? docObj.file_name.replace(/\.[^/.]+$/, "") : "Document";
        }
    }

    if (modal && sourceType !== "FILE") modal.hide();
    showMindMapLoading(true, `Building interactive Concept Mind Map for "${topic}"...`);

    try {
        const payload = {
            source_type: sourceType,
            topic: topic,
            text: text,
            document_id: docId
        };

        const res = await fetch(`${API_ROOT}/study/mindmaps/generate`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${accessToken}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            const data = await res.json();
            activeMindMapData = data;
            activeMindMapLayout = data.layout_type || "tree";

            const titleEl = document.getElementById("mindmap-active-title");
            if (titleEl) titleEl.innerText = data.title || `Mind Map — ${topic}`;

            const emptyEl = document.getElementById("mm-empty-state");
            if (emptyEl) emptyEl.classList.add("d-none");

            updateMindMapLearningOverviewStats();
            renderMindMapCanvas();
            mindmapCanvasFit();
        } else {
            alert("Failed to build mind map.");
        }
    } catch (e) {
        console.error("Execute create mind map error:", e);
        alert("Error building mind map.");
    } finally {
        showMindMapLoading(false);
    }
}

// ------------------- STUDY COMPANION INTEGRATION -------------------

async function generateNotesFromNodeUI() {
    if (!selectedMindMapNode) return;
    const topic = selectedMindMapNode.name;
    
    // Call backend live topic notes generator
    try {
        const res = await fetch(`${API_ROOT}/study/notes/generate-for-topic`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ subject: 'Concept Review', topic: topic })
        });
        if (res.ok) {
            const data = await res.json();
            document.getElementById('notes-modal-title').innerHTML = `📝 Notes: ${escapeHtml(topic)}`;
            document.getElementById('notes-pane-short').innerText = data.short_summary || `Executive Summary of ${topic}.`;
            document.getElementById('notes-pane-detailed').innerText = data.detailed_summary || `Comprehensive Chapter Breakdown for ${topic}.`;
            document.getElementById('notes-pane-exam').innerText = data.exam_notes || `High-Yield Exam Cram Notes for ${topic}.`;

            const modalEl = document.getElementById('notesModal');
            if (modalEl) {
                const modal = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
                modal.show();
            }
        }
    } catch (e) {
        openDocumentNotesForTopic(topic, selectedMindMapNode.detailed_explanation);
    }
}

async function openDocumentNotesForTopic(topic, text) {
    document.getElementById("notes-modal-title").innerHTML = `📝 Notes: ${topic}`;
    document.getElementById("notes-pane-short").innerText = `### Executive Summary\n\n- ${topic}: ${text || 'Core concept review.'}`;
    document.getElementById("notes-pane-detailed").innerText = `### Detailed Chapter Breakdown\n\n#### Key Principles:\n- Comprehensive analysis of ${topic}.\n- Operational workflows and implementation strategies.`;
    document.getElementById("notes-pane-exam").innerText = `### High-Yield Exam Cram Notes\n\n- **Key Point**: ${topic} is critical for exam assessment.`;

    const modalEl = document.getElementById("notesModal");
    let modal = bootstrap.Modal.getInstance(modalEl);
    if (!modal) modal = new bootstrap.Modal(modalEl);
    modal.show();
}

async function generateFlashcardsFromNodeUI() {
    if (!selectedMindMapNode) return;
    const topic = selectedMindMapNode.name;

    try {
        const res = await fetch(`${API_ROOT}/study/flashcards/generate-for-topic`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ subject: 'Concept Review', topic: topic })
        });
        if (res.ok) {
            const data = await res.json();
            currentFlashcards = data.cards || [];
            currentCardIndex = 0;
            isCardFlipped = false;
            
            const modalEl = document.getElementById('flashcardsModal');
            if (modalEl) {
                const modal = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
                modal.show();
                renderFlashcard();
            }
        }
    } catch (e) {
        console.error("Flashcards generate error:", e);
    }
}

async function generateQuizFromNodeUI() {
    if (!selectedMindMapNode) return;
    const topic = selectedMindMapNode.name;

    try {
        const res = await fetch(`${API_ROOT}/study/quizzes/generate-for-topic`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ subject: 'Concept Review', topic: topic })
        });
        if (res.ok) {
            const data = await res.json();
            activeQuizData = data;
            currentQuestionIndex = 0;
            quizUserAnswers = {};
            
            const modalEl = document.getElementById('quizModal');
            if (modalEl) {
                const modal = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
                modal.show();
                renderQuizQuestion();
            }
        }
    } catch (e) {
        console.error("Quiz generate error:", e);
    }
}

// ------------------- NODE EDITING & SAVING -------------------

function editSelectedNodeNameUI() {
    promptEditNodeName();
}

function addChildNodeUI() {
    promptAddChildNode();
}

function promptEditNodeName() {
    if (!selectedMindMapNode) return;
    const newName = prompt("Edit Concept Name:", selectedMindMapNode.name);
    if (newName && newName.trim()) {
        selectedMindMapNode.name = newName.trim();
        document.getElementById("mm-concept-title").innerText = selectedMindMapNode.name;
        renderMindMapCanvas();
    }
}

function promptAddChildNode() {
    if (!selectedMindMapNode) return;
    const childName = prompt(`Add Child Concept under '${selectedMindMapNode.name}':`);
    if (childName && childName.trim()) {
        const childId = `manual-${Date.now()}`;
        activeMindMapData.nodes.push({
            id: childId,
            name: childName.trim(),
            definition: `Child concept under ${selectedMindMapNode.name}.`,
            detailed_explanation: `Manual concept added by student under ${selectedMindMapNode.name}.`,
            importance: "Medium",
            parent_id: selectedMindMapNode.id,
            related: [selectedMindMapNode.name],
            mastery: null,
            status: "Learning"
        });
        activeMindMapData.relationships.push({
            from: selectedMindMapNode.id,
            to: childId,
            type: "Parent-Child"
        });
        collapsedNodeIds.delete(selectedMindMapNode.id);
        updateMindMapLearningOverviewStats();
        renderMindMapCanvas();
    }
}

function deleteSelectedNodeUI() {
    if (!selectedMindMapNode) return;
    if (!confirm(`Delete concept '${selectedMindMapNode.name}' and its sub-nodes?`)) return;

    const deleteId = selectedMindMapNode.id;
    activeMindMapData.nodes = activeMindMapData.nodes.filter(n => n.id !== deleteId && n.parent_id !== deleteId);
    activeMindMapData.relationships = activeMindMapData.relationships.filter(r => r.from !== deleteId && r.to !== deleteId);
    
    selectedMindMapNode = null;
    document.getElementById("mm-panel-unselected").classList.remove("d-none");
    document.getElementById("mm-panel-selected").classList.add("d-none");

    updateMindMapLearningOverviewStats();
    renderMindMapCanvas();
}

async function saveActiveMindMapUI() {
    if (!activeMindMapData) {
        alert("No active mind map to save.");
        return;
    }

    try {
        const res = await fetch(`${API_ROOT}/study/mindmaps/save`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${accessToken}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                id: activeMindMapData.id || null,
                title: activeMindMapData.title || "My Mind Map",
                source_type: activeMindMapData.source_type || "TOPIC",
                nodes_data: activeMindMapData,
                layout_type: activeMindMapLayout
            })
        });

        if (res.ok) {
            const saved = await res.json();
            activeMindMapData.id = saved.id;
            alert("Mind Map saved successfully to your profile!");
        } else {
            alert("Failed to save Mind Map.");
        }
    } catch (e) {
        alert("Error saving Mind Map.");
    }
}

async function openMyMindMapsModal() {
    const listEl = document.getElementById("my-mindmaps-list");
    listEl.innerHTML = `<div class="text-center text-info py-4"><div class="spinner-border spinner-border-sm me-2"></div>Loading saved mind maps...</div>`;
    
    const modal = new bootstrap.Modal(document.getElementById("myMindMapsModal"));
    modal.show();

    try {
        const res = await fetch(`${API_ROOT}/study/mindmaps`, {
            headers: { "Authorization": `Bearer ${accessToken}` }
        });

        if (res.ok) {
            const maps = await res.json();
            if (maps.length === 0) {
                listEl.innerHTML = `<div class="text-secondary text-center py-4">No saved mind maps found. Create and save one!</div>`;
                return;
            }

            listEl.innerHTML = maps.map(m => `
                <div class="list-group-item glass-panel d-flex justify-content-between align-items-center text-white mb-2 p-3">
                    <div>
                        <h6 class="fw-bold m-0"><span class="me-2">🗺️</span>${escapeHtml(m.title)}</h6>
                        <small class="text-secondary">Saved: ${new Date(m.updated_at).toLocaleDateString()} | Source: ${m.source_type}</small>
                    </div>
                    <div class="d-flex gap-2">
                        <button class="btn btn-sm btn-primary-custom" onclick="openSavedMindMapUI('${m.id}')">Open Map</button>
                        <button class="btn btn-sm btn-outline-danger" onclick="deleteSavedMindMapUI('${m.id}')" title="Delete">🗑️</button>
                    </div>
                </div>
            `).join('');
        }
    } catch (e) {
        listEl.innerHTML = `<div class="text-danger text-center py-4">Error loading mind maps.</div>`;
    }
}

async function openSavedMindMapUI(mapId) {
    const modalEl = document.getElementById("myMindMapsModal");
    const modal = bootstrap.Modal.getInstance(modalEl);
    if (modal) modal.hide();

    showMindMapLoading(true, "Loading saved mind map...");
    try {
        const res = await fetch(`${API_ROOT}/study/mindmaps/${mapId}`, {
            headers: { "Authorization": `Bearer ${accessToken}` }
        });

        if (res.ok) {
            const savedMap = await res.json();
            activeMindMapData = savedMap.nodes_data || savedMap;
            activeMindMapData.id = savedMap.id;
            activeMindMapLayout = savedMap.layout_type || "tree";
            
            document.getElementById("mm-layout-select").value = activeMindMapLayout;
            document.getElementById("mindmap-active-title").innerText = savedMap.title;
            document.getElementById("mm-empty-state").classList.add("d-none");

            updateMindMapLearningOverviewStats();
            renderMindMapCanvas();
        }
    } catch (e) {
        alert("Error opening mind map.");
    } finally {
        showMindMapLoading(false);
    }
}

async function deleteSavedMindMapUI(mapId) {
    if (!confirm("Delete this saved Mind Map?")) return;
    try {
        const res = await fetch(`${API_ROOT}/study/mindmaps/${mapId}`, {
            method: "DELETE",
            headers: { "Authorization": `Bearer ${accessToken}` }
        });
        if (res.ok) {
            openMyMindMapsModal();
        }
    } catch (e) {
        alert("Error deleting mind map.");
    }
}

// ------------------- OVERVIEW STATS & EXPORT -------------------

function updateMindMapLearningOverviewStats() {
    if (!activeMindMapData || !activeMindMapData.nodes) return;

    const nodes = activeMindMapData.nodes;
    const total = nodes.length;
    const topics = nodes.filter(n => !n.parent_id || n.parent_id === "root").length;
    const mastered = nodes.filter(n => n.mastery !== null && n.mastery >= 60).length;
    const weak = nodes.filter(n => n.mastery !== null && n.mastery < 60).length;

    const masteryScores = nodes.filter(n => n.mastery !== null).map(n => n.mastery);
    const avgMastery = masteryScores.length > 0 ? Math.round(masteryScores.reduce((a,b)=>a+b, 0) / masteryScores.length) : null;

    document.getElementById("mm-stat-total").innerText = total;
    document.getElementById("mm-stat-topics").innerText = topics;
    document.getElementById("mm-stat-mastered").innerText = mastered;
    document.getElementById("mm-stat-weak").innerText = weak;
    document.getElementById("mm-stat-avg-mastery").innerText = avgMastery !== null ? `${avgMastery}%` : "Not enough data";

    const insightEl = document.getElementById("mindmap-ai-insight-text");
    if (weak > 0) {
        insightEl.innerHTML = `<span class="text-warning"><i class="bi bi-lightbulb-fill me-1"></i>AI Insight:</span> You have ${weak} concept(s) needing revision. Click "Needs Revision" nodes to review notes & quizzes.`;
    } else if (mastered > 0) {
        insightEl.innerHTML = `<span class="text-success"><i class="bi bi-check-circle-fill me-1"></i>AI Insight:</span> Strong mastery detected across ${mastered} concept(s). Excellent progress!`;
    } else {
        insightEl.innerHTML = `Turn your learning material into an interactive visual knowledge map. Click any concept node to explore.`;
    }
}

function exportMindMap(format) {
    if (!activeMindMapData) {
        alert("No active mind map to export.");
        return;
    }

    if (format === "json") {
        const jsonStr = JSON.stringify(activeMindMapData, null, 2);
        const blob = new Blob([jsonStr], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${activeMindMapData.title || 'MindMap'}.json`;
        a.click();
    } else {
        alert(`Exporting Mind Map as ${format.toUpperCase()} image...`);
        window.print();
    }
}

// ═══════════════════════════════════════════════════════════════════
// AI STUDY PLANNER & COACH — Complete Dynamic Engine
// ═══════════════════════════════════════════════════════════════════

let spActivities = [];
let spCalendarView = 'week';
let pomodoroInterval = null;
let pomodoroSecondsLeft = 25 * 60;
let pomodoroIsRunning = false;
let pomodoroIsPaused = false;
let pomodoroIsBreak = false;
let pomodoroSessionCount = 0;
let spSubjectCounter = 0;

// ─── Load Planner Tab ─────────────────────────────────────
async function loadStudyPlannerTab() {
    await spLoadProfile();
    await spLoadActivities();
    await spLoadStreak();
    await spLoadAnalytics();
    await spLoadGoals();
    await spLoadRecommendations();
    setTimeout(init3DTiltEngine, 200);
    setTimeout(initThreeJSHeroOrb, 200);
}

function spGetMarksBadge(marks) {
    if (marks < 60) return `<span class="sp-marks-display" style="background: rgba(239,68,68,0.15); color: #ef4444; border: 1px solid rgba(239,68,68,0.3);"><span style="color:#ef4444;">●</span> ${marks}% Weak Target</span>`;
    if (marks < 75) return `<span class="sp-marks-display" style="background: rgba(245,158,11,0.15); color: #f59e0b; border: 1px solid rgba(245,158,11,0.3);"><span style="color:#f59e0b;">●</span> ${marks}% Moderate</span>`;
    return `<span class="sp-marks-display" style="background: rgba(16,185,129,0.15); color: #10b981; border: 1px solid rgba(16,185,129,0.3);"><span style="color:#10b981;">●</span> ${marks}% Strong</span>`;
}

// ─── Subject Row Management ──────────────────────────────
function spAddSubjectRow(data = null) {
    spSubjectCounter++;
    const idx = spSubjectCounter;
    const container = document.getElementById('sp-subjects-container');
    const row = document.createElement('div');
    row.className = 'sp-subject-row shadow-sm';
    row.id = `sp-subj-${idx}`;
    const initialMarks = data ? data.marks : 50;
    
    row.innerHTML = `
        <!-- Subject Header: Name + Remove Button -->
        <div class="d-flex justify-content-between align-items-center gap-2 mb-2 pb-2 border-bottom border-secondary border-opacity-25">
            <div class="d-flex align-items-center gap-2 flex-grow-1">
                <span class="fs-5">📚</span>
                <input type="text" class="form-control glass-input fw-bold" placeholder="Subject Name (e.g. DSA, Python, ML)" 
                       value="${data ? escapeHtml(data.name) : ''}" data-field="name" style="font-size: 0.95rem;">
            </div>
            <button class="btn btn-sm btn-outline-danger fw-bold px-2 py-1 flex-shrink-0 btn-3d" onclick="spRemoveSubjectRow(${idx})" title="Remove Subject">
                <span>✕ Remove</span>
            </button>
        </div>

        <!-- Mastery Slider & Badge -->
        <div class="mb-3 p-2 rounded" style="background: rgba(255,255,255,0.02); border: 1px solid var(--border-color);">
            <div class="d-flex justify-content-between align-items-center mb-1">
                <span class="text-secondary small fw-bold">📊 Current Performance / Marks:</span>
                <span id="sp-marks-val-${idx}">${spGetMarksBadge(initialMarks)}</span>
            </div>
            <input type="range" class="form-range custom-slider mt-1" min="0" max="100" value="${initialMarks}" data-field="marks"
                   oninput="document.getElementById('sp-marks-val-${idx}').innerHTML=spGetMarksBadge(this.value)">
            <div class="d-flex justify-content-between text-secondary" style="font-size: 0.7rem; font-weight: 600;">
                <span>0% (Beginner)</span>
                <span>50% (Intermediate)</span>
                <span>100% (Mastered)</span>
            </div>
        </div>

        <!-- Weak vs Strong Topics -->
        <div class="row g-2 mb-3">
            <div class="col-12 col-md-6">
                <label class="form-label text-secondary mb-1 fw-bold small">⚠️ Weak Topics (Comma separated)</label>
                <input type="text" class="form-control glass-input form-control-sm" placeholder="e.g. Dynamic Programming, Trees" data-field="weak_topics"
                       value="${data && data.weak_topics ? data.weak_topics.join(', ') : ''}">
            </div>
            <div class="col-12 col-md-6">
                <label class="form-label text-secondary mb-1 fw-bold small">✅ Strong Topics (For Revision)</label>
                <input type="text" class="form-control glass-input form-control-sm" placeholder="e.g. Arrays, OOP" data-field="strong_topics"
                       value="${data && data.strong_topics ? data.strong_topics.join(', ') : ''}">
            </div>
        </div>

        <!-- Exam Date & Priority -->
        <div class="row g-2">
            <div class="col-12 col-md-6">
                <label class="form-label text-secondary mb-1 fw-bold small">📅 Exam Date / Target Deadline</label>
                <input type="date" class="form-control glass-input form-control-sm" data-field="exam_date"
                       value="${data && data.exam_date ? data.exam_date : ''}">
            </div>
            <div class="col-12 col-md-6">
                <label class="form-label text-secondary mb-1 fw-bold small">⭐ Priority (1 to 10 scale)</label>
                <input type="number" class="form-control glass-input form-control-sm" min="1" max="10" value="${data ? data.priority : 5}" data-field="priority">
            </div>
        </div>
    `;
    container.appendChild(row);
    spUpdateSubjectBadgeCount();
}

function spRemoveSubjectRow(idx) {
    const row = document.getElementById(`sp-subj-${idx}`);
    if (row) row.remove();
    spUpdateSubjectBadgeCount();
}

function spUpdateSubjectBadgeCount() {
    const count = document.querySelectorAll('.sp-subject-row').length;
    const badge = document.getElementById('sp-subject-count-badge');
    if (badge) badge.textContent = `${count} Subject${count !== 1 ? 's' : ''}`;
}

// ─── Syllabus PDF Upload & Auto-Plan Creation ─────────────
async function spUploadSyllabusFile(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (!accessToken) {
        await silentTokenRefresh();
        if (!accessToken) {
            showAuthModal();
            return;
        }
    }

    spShowToast(`Uploading & analyzing ${file.name} with AI...`, '📄');

    const formData = new FormData();
    formData.append('file', file);

    try {
        const res = await fetch(`${API_ROOT}/study/planner/extract-syllabus`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`
            },
            body: formData
        });

        let data = {};
        if (res.ok) {
            data = await res.json();
        } else {
            // If backend returned error, construct client-side extracted subject from filename
            const cleanName = file.name.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " ");
            data = {
                course_metadata: { course_name: cleanName },
                topics: [
                    {
                        name: cleanName || "Core Syllabus Subject",
                        marks: 50,
                        weak_topics: ["Advanced Topics", "Practical Problems"],
                        strong_topics: ["Core Concepts", "Definitions"],
                        priority: 8,
                        exam_date: null
                    }
                ]
            };
        }

        const topics = data.topics || [];

        if (topics.length === 0) {
            const cleanName = file.name.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " ");
            topics.push({
                name: cleanName || "Syllabus Module",
                marks: 50,
                weak_topics: ["Problem Sets"],
                strong_topics: ["Basics"],
                priority: 7,
                exam_date: null
            });
        }

        // Clear existing subjects container
        const container = document.getElementById('sp-subjects-container');
        if (container) container.innerHTML = '';
        spSubjectCounter = 0;

        // Auto-populate extracted topics
        topics.forEach(t => {
            spAddSubjectRow(t);
        });

        // Set course goal if available
        if (data.course_metadata && data.course_metadata.course_name) {
            const goalInput = document.getElementById('sp-study-goal');
            if (goalInput) {
                goalInput.value = `Master ${data.course_metadata.course_name} and score 90%+ in exams`;
            }
        }

        spShowToast(`✨ Extracted ${topics.length} module(s) from "${file.name}"! Building day-wise curriculum schedule...`, '🎯');

        // Automatically trigger 7-day multi-day study plan generation
        await spSaveProfileAndGenerate('week');

    } catch (e) {
        console.error("Syllabus upload error:", e);
        // Fallback: create subject from filename
        const cleanName = file.name.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " ");
        spAddSubjectRow({
            name: cleanName || "Syllabus Subject",
            marks: 50,
            weak_topics: ["Key Topics", "Problem Sets"],
            strong_topics: ["Foundations"],
            priority: 7,
            exam_date: null
        });
        await spSaveProfileAndGenerate('week');
    } finally {
        event.target.value = '';
    }
}

function spCollectSubjects() {
    const rows = document.querySelectorAll('.sp-subject-row');
    const subjects = [];
    rows.forEach(row => {
        const name = row.querySelector('[data-field="name"]').value.trim();
        if (!name) return;
        const marks = parseFloat(row.querySelector('[data-field="marks"]').value) || 50;
        const weakRaw = row.querySelector('[data-field="weak_topics"]').value;
        const strongRaw = row.querySelector('[data-field="strong_topics"]').value;
        const examDate = row.querySelector('[data-field="exam_date"]').value;
        const priority = parseInt(row.querySelector('[data-field="priority"]').value) || 5;
        subjects.push({
            name,
            marks,
            weak_topics: weakRaw ? weakRaw.split(',').map(t => t.trim()).filter(t => t) : [],
            strong_topics: strongRaw ? strongRaw.split(',').map(t => t.trim()).filter(t => t) : [],
            exam_date: examDate || null,
            priority
        });
    });
    return subjects;
}

// ─── Profile Load/Save ───────────────────────────────────
async function spLoadProfile() {
    try {
        const res = await fetch(`${API_ROOT}/planner/profile`, {
            headers: { "Authorization": `Bearer ${accessToken}` }
        });
        if (res.ok) {
            const profile = await res.json();
            document.getElementById('sp-daily-hours').value = profile.daily_hours;
            document.getElementById('sp-hours-display').textContent = parseFloat(profile.daily_hours).toFixed(1) + ' hours';
            if (profile.study_goal) document.getElementById('sp-study-goal').value = profile.study_goal;

            // Set preferred time radio
            const radios = document.querySelectorAll('input[name="sp-time"]');
            radios.forEach(r => {
                r.checked = r.value === profile.preferred_study_time;
                r.parentElement.classList.toggle('active-option', r.checked);
            });

            // Load subjects
            document.getElementById('sp-subjects-container').innerHTML = '';
            spSubjectCounter = 0;
            if (profile.subjects && profile.subjects.length > 0) {
                profile.subjects.forEach(s => spAddSubjectRow(s));
                spUpdatePomodoroSubjects(profile.subjects);
            } else {
                spAddSubjectRow(); // Default empty row
            }
        } else {
            spAddSubjectRow(); // Default empty row
        }
    } catch (e) {
        spAddSubjectRow();
    }
}

function spUpdatePomodoroSubjects(subjects) {
    const sel = document.getElementById('sp-pomodoro-subject');
    if (!sel) return;
    sel.innerHTML = '<option value="General">General Study</option>';
    subjects.forEach(s => {
        sel.innerHTML += `<option value="${escapeHtml(s.name)}">${escapeHtml(s.name)}</option>`;
    });
}

// ─── Save Profile & Generate Plan ────────────────────────
async function spSaveProfileAndGenerate(scope) {
    const subjects = spCollectSubjects();
    if (subjects.length === 0) {
        alert('Please add at least one subject to generate your study plan.');
        return;
    }

    const dailyHours = parseFloat(document.getElementById('sp-daily-hours').value) || 4;
    const preferredTime = document.querySelector('input[name="sp-time"]:checked')?.value || 'Evening';
    const studyGoal = document.getElementById('sp-study-goal').value.trim();

    // Save profile
    try {
        await fetch(`${API_ROOT}/planner/profile`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ daily_hours: dailyHours, preferred_study_time: preferredTime, study_goal: studyGoal, subjects })
        });
        spUpdatePomodoroSubjects(subjects);
    } catch (e) { console.error('Profile save error', e); }

    // Generate plan
    try {
        const res = await fetch(`${API_ROOT}/planner/generate`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ plan_scope: scope, force_regenerate: true })
        });
        if (res.ok) {
            spActivities = await res.json();
            spRenderPlanTable(spActivities);
            spRenderTimeDistribution(spActivities);
            document.getElementById('sp-plan-actions').style.cssText = 'display:flex!important';
            spRenderCalendar(spActivities);
            spLoadAnalytics();
            spLoadRecommendations();
            spShowToast('Personalized AI study plan generated! 🚀', '⚡');
        } else {
            spShowToast('Failed to generate plan. Please check subject details.', '❌');
        }
} catch (e) { spShowToast('Error connecting to planner API.', '❌'); }
}

// ─── Render Plan Table ───────────────────────────────────
function spRenderPlanTable(activities) {
    const container = document.getElementById('sp-plan-table-container');
    if (!activities || activities.length === 0) {
        container.innerHTML = `
            <div class="text-secondary py-5 text-center">
                <div class="fs-1 mb-2">📅</div>
                <h6 class="fw-bold">No study sessions scheduled</h6>
                <p class="small text-secondary mb-0">Click <strong>Generate Today's Plan</strong> to build your schedule.</p>
            </div>
        `;
        return;
    }

    // Group by date
    const groups = {};
    activities.forEach(a => {
        if (!groups[a.calendar_date]) groups[a.calendar_date] = [];
        groups[a.calendar_date].push(a);
    });

    const totalDays = Object.keys(groups).length;
    const uniqueTopics = new Set(activities.map(a => `${a.subject}: ${a.topic}`)).size;
    const totalMinutes = activities.reduce((sum, a) => sum + (a.planned_duration_min || 0), 0);
    const totalHours = (totalMinutes / 60).toFixed(1);

    const todayStr = spFormatLocalDate(new Date());

    // ─── 🌳 Day 1, Day 2, Day 3... Interactive Topic Coverage Tree Graph ───
    let roadmapHtml = '<div class="sp-roadmap-container mb-3">';
    const sortedDates = Object.keys(groups).sort();
    sortedDates.forEach((date, idx) => {
        const dayItems = groups[date];
        const isToday = date === todayStr;
        const dayNum = idx + 1;
        const firstTopic = (dayItems[0]?.topic || 'Curriculum Module').replace(/\(Revision\)/i, '').trim();
        const firstSubj = dayItems[0]?.subject || 'Course Unit';
        const allCompleted = dayItems.every(i => i.status === 'completed');

        roadmapHtml += `
            <div class="sp-roadmap-node ${isToday ? 'active-today' : ''}" onclick="spScrollToDate('${date}')" title="Click to view Day ${dayNum} Schedule">
                <div>
                    <div class="d-flex justify-content-between align-items-center mb-1">
                        <span class="sp-roadmap-day-badge ${isToday ? 'bg-primary text-white' : 'bg-secondary bg-opacity-25 text-info'}">
                            ${isToday ? '🌟 Today' : '📅 Day ' + dayNum}
                        </span>
                        <span class="badge ${allCompleted ? 'bg-success' : 'bg-secondary'} small" style="font-size: 0.65rem;">
                            ${allCompleted ? '✓ Completed' : dayItems.length + ' session' + (dayItems.length > 1 ? 's' : '')}
                        </span>
                    </div>
                    <div class="sp-roadmap-topic-title">${escapeHtml(firstTopic)}</div>
                </div>
                <div class="sp-roadmap-subj d-flex justify-content-between align-items-center mt-2 pt-1 border-top border-secondary border-opacity-25">
                    <span>📚 ${escapeHtml(firstSubj)}</span>
                    <span style="font-size: 0.7rem;">${date}</span>
                </div>
            </div>
        `;
    });
    roadmapHtml += '</div>';

    let html = `
        <div class="mb-3 p-3 rounded" style="background: linear-gradient(135deg, rgba(99, 102, 241, 0.08) 0%, rgba(139, 92, 246, 0.05) 100%); border: 1px solid rgba(99, 102, 241, 0.25);">
            <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-2">
                <span class="fw-bold small text-white">🌳 Curriculum Topic Coverage Roadmap (Day-by-Day):</span>
                <div class="d-flex gap-2 flex-wrap">
                    <span class="badge bg-primary px-2 py-1">🗓️ ${totalDays} Day${totalDays > 1 ? 's' : ''} Scope</span>
                    <span class="badge bg-info text-dark px-2 py-1 fw-bold">📖 ${uniqueTopics} Topics Covered</span>
                    <span class="badge bg-warning text-dark px-2 py-1 fw-bold">⏱️ ${totalHours} Total Hours</span>
                </div>
            </div>
            ${roadmapHtml}
        </div>
    `;

    sortedDates.forEach((date, idx) => {
        const items = groups[date];
        const isToday = date === todayStr;
        const dayNum = idx + 1;
        html += `
            <div class="mb-4" id="sp-date-group-${date}">
                <div class="d-flex justify-content-between align-items-center mb-2 pb-1 border-bottom border-secondary border-opacity-25">
                    <span class="fw-bold small ${isToday ? 'text-primary' : 'text-secondary'}">
                        ${isToday ? '🌟 Today (Day ' + dayNum + ' — ' + date + ')' : '📅 Day ' + dayNum + ' (' + date + ')'}
                    </span>
                    <span class="badge bg-secondary small">${items.length} Session${items.length !== 1 ? 's' : ''}</span>
                </div>
        `;
        
        items.forEach(a => {
            const priClass = (a.priority || 'Medium').toLowerCase();
            const statusClass = a.status === 'completed' ? 'completed' : a.status === 'missed' ? 'missed' : '';
            const isRevision = a.topic && a.topic.includes('(Revision)');
            const topicTag = isRevision 
                ? '<span class="sp-tag-badge strong">🔄 Revision</span>' 
                : '<span class="sp-tag-badge weak">🎯 Weak Focus</span>';

            html += `
                <div class="sp-activity-row ${statusClass}" onclick="spOpenSessionDetail('${a.id}')" style="cursor: pointer;" title="Click to view detailed AI study plan & checklist">
                    <div class="sp-activity-main">
                        <div class="d-flex align-items-center gap-2 flex-wrap mb-1">
                            <span class="sp-time-pill">⏰ ${a.start_time} – ${a.end_time}</span>
                            <span class="fw-bold text-white fs-6">📚 ${escapeHtml(a.subject)}</span>
                            <span class="priority-badge ${priClass}">${a.priority === 'High' ? '🔴' : a.priority === 'Medium' ? '🟡' : '🟢'} ${a.priority} Priority</span>
                            <span class="badge bg-secondary" style="font-size: 0.75rem;">⏱️ ${a.planned_duration_min}m</span>
                        </div>
                        <div class="d-flex align-items-center gap-2 mt-1">
                            ${topicTag}
                            <span class="text-white small fw-bold">📖 ${escapeHtml(a.topic || 'General Practice')}</span>
                        </div>
                    </div>
                    <div class="d-flex gap-1" onclick="event.stopPropagation()">
                        ${a.status === 'pending' ? `
                            <button class="btn btn-sm btn-outline-success btn-3d" onclick="spMarkActivity('${a.id}', 'completed')" title="Mark Done">
                                <span>✓</span>
                            </button>
                            <button class="btn btn-sm btn-outline-danger btn-3d" onclick="spMarkActivity('${a.id}', 'missed')" title="Mark Missed">
                                <span>✕</span>
                            </button>
                        ` : ''}
                        <button class="btn btn-sm btn-outline-secondary btn-3d" onclick="spDeleteActivity('${a.id}')" title="Delete">
                            <span>🗑</span>
                        </button>
                    </div>
                </div>
            `;
        });

        html += `</div>`;
    });

    container.innerHTML = html;
}

function spScrollToDate(date) {
    const el = document.getElementById(`sp-date-group-${date}`);
    if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.style.transition = 'all 0.4s ease';
        el.style.borderRadius = '12px';
        el.style.background = 'rgba(99, 102, 241, 0.15)';
        setTimeout(() => {
            el.style.background = 'transparent';
        }, 1500);
    }
}

// ─── Study Session Detail Modal & Actions ─────────────────
let spCurrentDetailActivity = null;

function spOpenSessionDetail(activityId) {
    const a = spActivities.find(item => String(item.id) === String(activityId));
    if (!a) return;

    spCurrentDetailActivity = a;

    // Header & Title
    const titleEl = document.getElementById('sp-modal-subj-title');
    if (titleEl) titleEl.textContent = `${a.subject}`;
    
    // Priority badge
    const priBadge = document.getElementById('sp-modal-priority-badge');
    if (priBadge) {
        const pri = a.priority || 'Medium';
        priBadge.className = `priority-badge ${pri.toLowerCase()}`;
        priBadge.textContent = `${pri === 'High' ? '🔴' : pri === 'Medium' ? '🟡' : '🟢'} ${pri.toUpperCase()} PRIORITY`;
    }

    // Status badge
    const statBadge = document.getElementById('sp-modal-status-badge');
    if (statBadge) {
        if (a.status === 'completed') {
            statBadge.className = 'badge bg-success px-2 py-1';
            statBadge.textContent = '✓ Completed';
        } else if (a.status === 'missed') {
            statBadge.className = 'badge bg-danger px-2 py-1';
            statBadge.textContent = '✕ Missed';
        } else {
            statBadge.className = 'badge bg-secondary px-2 py-1';
            statBadge.textContent = '⏳ Scheduled';
        }
    }

    // Metrics
    const timeWinEl = document.getElementById('sp-modal-time-window');
    if (timeWinEl) timeWinEl.textContent = `${a.start_time} – ${a.end_time}`;
    
    const durEl = document.getElementById('sp-modal-duration');
    const hours = (a.planned_duration_min / 60).toFixed(1);
    if (durEl) durEl.textContent = `${a.planned_duration_min} min (${hours}h)`;
    
    const dateEl = document.getElementById('sp-modal-date');
    if (dateEl) dateEl.textContent = `${a.calendar_date}`;

    // Subject metadata & robust non-empty topic resolution
    const subjects = spCollectSubjects();
    const subjData = subjects.find(s => s.name && s.name.toLowerCase() === (a.subject || '').toLowerCase()) || {};

    let topic = (a.topic && a.topic.trim()) ? a.topic.trim() : '';
    if (!topic || topic.toLowerCase() === 'none' || topic.toLowerCase() === 'null') {
        topic = (subjData.weak_topics && subjData.weak_topics[0]) || `${a.subject} Fundamentals`;
    }

    const isRevision = topic.includes('(Revision)');
    const cleanTopic = topic.replace(/\(Revision\)/i, '').trim();

    const topicTitleEl = document.getElementById('sp-modal-topic-title');
    if (topicTitleEl) topicTitleEl.textContent = `Topic: ${cleanTopic}`;
    
    const topicTag = document.getElementById('sp-modal-topic-tag');
    if (topicTag) {
        topicTag.className = isRevision ? 'sp-tag-badge strong' : 'sp-tag-badge weak';
        topicTag.textContent = isRevision ? '🔄 Revision Review' : '🎯 Weak Focus Target';
    }

    const descEl = document.getElementById('sp-modal-topic-desc');
    if (descEl) {
        descEl.textContent = isRevision
            ? `Reinforce foundational understanding and review key formulas for ${a.subject}.`
            : `AI-allocated high-impact focus session to target weak areas in ${a.subject} and accelerate exam readiness.`;
    }
    
    const weakListEl = document.getElementById('sp-modal-weak-topics-list');
    if (weakListEl) {
        const weak = subjData.weak_topics && subjData.weak_topics.length > 0 ? subjData.weak_topics : [cleanTopic];
        weakListEl.innerHTML = weak.map(t => `<span class="badge bg-danger bg-opacity-25 text-danger px-2 py-1 small">⚠️ ${escapeHtml(t)}</span>`).join('');
    }

    const strongListEl = document.getElementById('sp-modal-strong-topics-list');
    if (strongListEl) {
        const strong = subjData.strong_topics && subjData.strong_topics.length > 0 ? subjData.strong_topics : ['Foundational Principles'];
        strongListEl.innerHTML = strong.map(t => `<span class="badge bg-success bg-opacity-25 text-success px-2 py-1 small">✅ ${escapeHtml(t)}</span>`).join('');
    }

    // Dynamic Topics & Concepts Breakdown with Live AI Fetch
    const topicsBreakdownEl = document.getElementById('sp-modal-topics-breakdown');
    if (topicsBreakdownEl) {
        // Show immediate sleek skeleton with topic tree
        topicsBreakdownEl.innerHTML = `
            <div class="p-2 rounded mb-2" style="background: rgba(99, 102, 241, 0.08); border-left: 3px solid var(--primary);">
                <div class="d-flex justify-content-between align-items-center flex-wrap gap-1 mb-1">
                    <span class="fw-bold text-white">🌳 Topic Hierarchy: <span class="text-primary">${escapeHtml(a.subject)}</span> ➔ <span class="text-info">${escapeHtml(cleanTopic)}</span></span>
                    ${isRevision ? '<span class="badge bg-info text-dark">Revision Session</span>' : '<span class="badge bg-danger text-white">Weak Focus Target</span>'}
                </div>
                <div class="text-secondary small">Scheduled Date: <strong>${a.calendar_date}</strong> • Planned duration: <strong>${a.planned_duration_min} minutes</strong></div>
            </div>
            <div class="py-2 text-center text-info small" id="sp-topic-ai-loading">
                <span class="spinner-border spinner-border-sm me-2" role="status"></span>
                <span>AI analyzing "${escapeHtml(cleanTopic)}" & generating dynamic curriculum breakdown...</span>
            </div>
        `;

        // Fetch live AI breakdown asynchronously
        fetch(`${API_ROOT}/study/planner/topic-breakdown`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ subject: a.subject, topic: cleanTopic, duration_minutes: a.planned_duration_min })
        })
        .then(res => res.json())
        .then(data => {
            if (spCurrentDetailActivity && String(spCurrentDetailActivity.id) === String(a.id)) {
                const subtopics = (data.subtopics && data.subtopics.length > 0) ? data.subtopics : [
                    `Foundational Theory, Definitions & Scope of ${cleanTopic}`,
                    `Core Architectural Mechanisms & Working Procedures in ${a.subject}`,
                    `Standard Problem Solving Patterns & Edge-Case Handling`,
                    `High-Yield Exam Questions & Common Conceptual Pitfalls`
                ];
                const formulas = data.key_formulas_and_definitions || [];
                const pitfalls = data.exam_pitfalls || `Watch out for boundary condition violations and unhandled edge cases in ${cleanTopic}.`;
                const targets = data.practice_targets || [];

                topicsBreakdownEl.innerHTML = `
                    <div class="p-2 rounded mb-2" style="background: rgba(99, 102, 241, 0.08); border-left: 3px solid var(--primary);">
                        <div class="d-flex justify-content-between align-items-center flex-wrap gap-1 mb-1">
                            <span class="fw-bold text-white">🌳 Topic Hierarchy: <span class="text-primary">${escapeHtml(a.subject)}</span> ➔ <span class="text-info">${escapeHtml(cleanTopic)}</span></span>
                            ${isRevision ? '<span class="badge bg-info text-dark">Revision Session</span>' : '<span class="badge bg-danger text-white">Weak Focus Target</span>'}
                        </div>
                        <div class="text-secondary" style="font-size: 0.8rem;">Scheduled Date: <strong>${a.calendar_date}</strong> • Allocated: <strong>${a.planned_duration_min} minutes</strong></div>
                    </div>

                    <div class="d-flex flex-column gap-2">
                        <div class="d-flex align-items-start gap-2">
                            <span class="text-info fw-bold">📌</span>
                            <div>
                                <strong class="text-white">Key Subtopics to Master:</strong>
                                <ul class="mb-0 ps-3 text-secondary mt-1" style="line-height: 1.5;">
                                    ${subtopics.map(st => `<li>${escapeHtml(st)}</li>`).join('')}
                                </ul>
                            </div>
                        </div>

                        ${formulas.length > 0 ? `
                        <div class="d-flex align-items-start gap-2 mt-1">
                            <span class="text-success fw-bold">📐</span>
                            <div>
                                <strong class="text-white">Key Formulas & Principles:</strong>
                                <ul class="mb-0 ps-3 text-secondary mt-1" style="line-height: 1.5;">
                                    ${formulas.map(f => `<li><code>${escapeHtml(f)}</code></li>`).join('')}
                                </ul>
                            </div>
                        </div>
                        ` : ''}

                        <div class="d-flex align-items-start gap-2 mt-1">
                            <span class="text-warning fw-bold">💡</span>
                            <div>
                                <strong class="text-white">High-Yield Exam Focus & Traps:</strong>
                                <span class="text-secondary ms-1">${escapeHtml(pitfalls)}</span>
                            </div>
                        </div>

                        ${targets.length > 0 ? `
                        <div class="d-flex align-items-start gap-2 mt-1">
                            <span class="text-primary fw-bold">🛠️</span>
                            <div>
                                <strong class="text-white">Recommended Practice Targets:</strong>
                                <ul class="mb-0 ps-3 text-secondary mt-1" style="line-height: 1.5;">
                                    ${targets.map(t => `<li>${escapeHtml(t)}</li>`).join('')}
                                </ul>
                            </div>
                        </div>
                        ` : ''}
                    </div>
                `;
            }
        })
        .catch(err => {
            console.error("Topic breakdown fetch error:", err);
            const loadEl = document.getElementById('sp-topic-ai-loading');
            if (loadEl) loadEl.remove();
        });
    }

    // Action buttons in modal
    const actionBtns = document.getElementById('sp-modal-action-buttons');
    if (actionBtns) {
        if (a.status === 'pending') {
            actionBtns.innerHTML = `
                <button class="btn btn-sm btn-success fw-bold btn-3d" onclick="spMarkFromModal('${a.id}','completed')">
                    <span>✓ Mark Done</span>
                </button>
                <button class="btn btn-sm btn-outline-danger fw-bold btn-3d" onclick="spMarkFromModal('${a.id}','missed')">
                    <span>✕ Mark Missed</span>
                </button>
                <button class="btn btn-sm btn-outline-secondary btn-3d" onclick="spDeleteFromModal('${a.id}')" title="Delete">
                    <span>🗑</span>
                </button>
            `;
        } else {
            actionBtns.innerHTML = `
                <button class="btn btn-sm btn-outline-secondary btn-3d" onclick="spDeleteFromModal('${a.id}')" title="Delete">
                    <span>🗑 Delete Session</span>
                </button>
            `;
        }
    }

    // Show modal
    const modalEl = document.getElementById('spSessionDetailModal');
    if (modalEl) {
        const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
        modal.show();
    }
}

async function spMarkFromModal(id, status) {
    const modalEl = document.getElementById('spSessionDetailModal');
    if (modalEl) {
        const modal = bootstrap.Modal.getInstance(modalEl);
        if (modal) modal.hide();
    }
    await spMarkActivity(id, status);
}

async function spDeleteFromModal(id) {
    const modalEl = document.getElementById('spSessionDetailModal');
    if (modalEl) {
        const modal = bootstrap.Modal.getInstance(modalEl);
        if (modal) modal.hide();
    }
    await spDeleteActivity(id);
}

function spLaunchPomodoroFromModal() {
    if (!spCurrentDetailActivity) return;
    const modalEl = document.getElementById('spSessionDetailModal');
    if (modalEl) {
        const modal = bootstrap.Modal.getInstance(modalEl);
        if (modal) modal.hide();
    }

    const sel = document.getElementById('sp-pomodoro-subject');
    if (sel) {
        let found = false;
        for (let i = 0; i < sel.options.length; i++) {
            if (sel.options[i].value === spCurrentDetailActivity.subject) {
                sel.selectedIndex = i;
                found = true;
                break;
            }
        }
        if (!found) {
            const opt = document.createElement('option');
            opt.value = spCurrentDetailActivity.subject;
            opt.textContent = spCurrentDetailActivity.subject;
            sel.appendChild(opt);
            sel.value = spCurrentDetailActivity.subject;
        }
    }

    // Scroll smoothly to pomodoro timer
    const pomoCard = document.getElementById('sp-pomodoro-time');
    if (pomoCard) {
        pomoCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    // Start timer if not already running
    if (!spTimerInterval) {
        spToggleTimer();
    }
    spShowToast(`🎯 Pomodoro focus session started on "${spCurrentDetailActivity.subject}"!`, '⏱️');
}

function switchStudySubTab(subTabId) {
    document.querySelectorAll('.study-sub-btn').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.getElementById(`subbtn-${subTabId}`);
    if (activeBtn) activeBtn.classList.add('active');

    const workspacePane = document.getElementById('study-subpane-workspace');
    const mindmapPane = document.getElementById('study-subpane-mindmap');
    const plannerPane = document.getElementById('study-subpane-planner');

    if (workspacePane) workspacePane.classList.toggle('d-none', subTabId !== 'workspace');
    if (mindmapPane) mindmapPane.classList.toggle('d-none', subTabId !== 'mindmap');
    if (plannerPane) plannerPane.classList.toggle('d-none', subTabId !== 'planner');

    if (subTabId === 'planner') {
        loadStudyPlannerTab();
    } else if (subTabId === 'mindmap') {
        loadMindMapTab();
    }
}

async function spLaunchNotesFromModal() {
    if (!spCurrentDetailActivity) return;
    const subj = spCurrentDetailActivity.subject;
    const topic = spCurrentDetailActivity.topic || 'General Concepts';

    const modalEl = document.getElementById('spSessionDetailModal');
    if (modalEl) {
        const modal = bootstrap.Modal.getInstance(modalEl);
        if (modal) modal.hide();
    }

    spShowToast(`📝 Auto-generating AI Notes for "${topic}"...`, '⚡');

    try {
        const res = await fetch(`${API_ROOT}/study/notes/generate-for-topic`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ subject: subj, topic: topic })
        });

        if (res.ok) {
            const data = await res.json();
            document.getElementById('notes-modal-title').innerHTML = `📚 Notes: ${escapeHtml(data.title)}`;
            document.getElementById('notes-pane-short').innerText = data.short_summary;
            document.getElementById('notes-pane-detailed').innerText = data.detailed_summary;
            document.getElementById('notes-pane-exam').innerText = data.exam_notes;

            const nModalEl = document.getElementById('notesModal');
            if (nModalEl) {
                bootstrap.Modal.getOrCreateInstance(nModalEl).show();
            }
            spShowToast(`✨ Notes generated for ${topic}!`, '🎯');
        } else {
            alert('Failed to generate notes.');
        }
    } catch (e) {
        alert('Error generating notes: ' + e.message);
    }
}

async function spLaunchFlashcardsFromModal() {
    if (!spCurrentDetailActivity) return;
    const subj = spCurrentDetailActivity.subject;
    const topic = spCurrentDetailActivity.topic || 'General Concepts';

    const modalEl = document.getElementById('spSessionDetailModal');
    if (modalEl) {
        const modal = bootstrap.Modal.getInstance(modalEl);
        if (modal) modal.hide();
    }

    spShowToast(`📇 Auto-generating Flashcards for "${topic}"...`, '⚡');

    try {
        const res = await fetch(`${API_ROOT}/study/flashcards/generate-for-topic`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ subject: subj, topic: topic })
        });

        if (res.ok) {
            const data = await res.json();
            activeFlashcards = data.cards || [];
            currentCardIndex = 0;

            if (activeFlashcards.length > 0) {
                renderFlashcard();
                const fModalEl = document.getElementById('flashcardsModal');
                if (fModalEl) {
                    bootstrap.Modal.getOrCreateInstance(fModalEl).show();
                }
                spShowToast(`✨ Loaded ${activeFlashcards.length} flashcards for ${topic}!`, '🎯');
            } else {
                alert('No flashcards generated.');
            }
        }
    } catch (e) {
        alert('Error generating flashcards: ' + e.message);
    }
}

async function spLaunchQuizFromModal() {
    if (!spCurrentDetailActivity) return;
    const subj = spCurrentDetailActivity.subject;
    const topic = spCurrentDetailActivity.topic || 'General Concepts';

    const modalEl = document.getElementById('spSessionDetailModal');
    if (modalEl) {
        const modal = bootstrap.Modal.getInstance(modalEl);
        if (modal) modal.hide();
    }

    spShowToast(`❓ Auto-generating Practice Quiz for "${topic}"...`, '⚡');

    try {
        const res = await fetch(`${API_ROOT}/study/quizzes/generate-for-topic`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ subject: subj, topic: topic })
        });

        if (res.ok) {
            const data = await res.json();
            currentQuiz = data;
            currentQuestionIndex = 0;
            userAnswers = {};

            document.getElementById('quiz-taking-container').classList.remove('d-none');
            document.getElementById('quiz-results-container').classList.add('d-none');
            document.getElementById('quiz-modal-title').innerHTML = `❓ Quiz: ${escapeHtml(data.title)}`;

            renderQuizQuestion();

            const qModalEl = document.getElementById('quizModal');
            if (qModalEl) {
                bootstrap.Modal.getOrCreateInstance(qModalEl).show();
            }
            spShowToast(`✨ Quiz ready: ${data.questions.length} questions on ${topic}!`, '🎯');
        } else {
            alert('Failed to generate quiz.');
        }
    } catch (e) {
        alert('Error generating quiz: ' + e.message);
    }
}

function spLaunchMindMapFromModal() {
    if (!spCurrentDetailActivity) return;
    const subj = spCurrentDetailActivity.subject;
    const topic = spCurrentDetailActivity.topic || 'General Concepts';

    const modalEl = document.getElementById('spSessionDetailModal');
    if (modalEl) {
        const modal = bootstrap.Modal.getInstance(modalEl);
        if (modal) modal.hide();
    }

    // Switch to study companion tab & mindmap subpane
    const navLinks = document.querySelectorAll('.nav-link-custom');
    if (navLinks.length > 1) {
        navLinks[1].click();
    }
    switchStudySubTab('mindmap');

    // Populate topic input in Mindmap generator
    const topicInput = document.getElementById('mm-create-topic-input');
    if (topicInput) {
        topicInput.value = `${subj}: ${topic}`;
        const sourceTopicRadio = document.getElementById('source_topic');
        if (sourceTopicRadio) sourceTopicRadio.checked = true;
        if (typeof toggleMindMapSourceInputs === 'function') {
            toggleMindMapSourceInputs('TOPIC');
        }
        if (typeof executeCreateMindMapForm === 'function') {
            executeCreateMindMapForm();
        }
    }
    spShowToast(`🗺️ Generating AI Concept Mind Map for ${topic}!`, '🧠');
}

function spRenderTimeDistribution(activities) {
    const distDiv = document.getElementById('sp-time-distribution');
    const badgesDiv = document.getElementById('sp-time-dist-badges');
    if (!activities || activities.length === 0) { 
        if (distDiv) distDiv.style.display = 'none'; 
        return; 
    }

    const subjectMinutes = {};
    activities.forEach(a => {
        subjectMinutes[a.subject] = (subjectMinutes[a.subject] || 0) + a.planned_duration_min;
    });

    let html = '';
    Object.entries(subjectMinutes).forEach(([subj, mins]) => {
        const hrs = (mins / 60).toFixed(1);
        html += `<span class="sp-dist-badge">📖 ${escapeHtml(subj)}: ${hrs}h</span>`;
    });

    badgesDiv.innerHTML = html;
    distDiv.style.display = 'block';
}

// ─── Activity Actions ────────────────────────────────────
async function spMarkActivity(activityId, status) {
    try {
        const body = { status };
        if (status === 'completed') {
            const act = spActivities.find(a => a.id === activityId);
            body.actual_duration_min = act ? act.planned_duration_min : 25;
            spShowToast('Study block marked complete! 🎉', '✓');
        } else if (status === 'missed') {
            spShowToast('Task missed. Rescheduled with boosted priority 🔄', '⚠️');
        }
        const res = await fetch(`${API_ROOT}/planner/activities/${activityId}`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        if (res.ok) {
            await spLoadActivities();
            await spLoadStreak();
            await spLoadAnalytics();
        }
    } catch (e) {}
}

async function spDeleteActivity(activityId) {
    try {
        await fetch(`${API_ROOT}/planner/activities/${activityId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        spShowToast('Study session removed', '🗑');
        await spLoadActivities();
    } catch (e) {}
}

async function spSetThisPlan() {
    try {
        const res = await fetch(`${API_ROOT}/planner/set-plan`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
        });
        if (res.ok) {
            const data = await res.json();
            spShowToast(`🎉 Plan confirmed! ${data.activities_confirmed} sessions locked onto your calendar.`, '📅');
            await spLoadActivities();
        }
    } catch (e) {}
}

async function spLoadActivities() {
    try {
        const res = await fetch(`${API_ROOT}/planner/activities`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        if (res.ok) {
            spActivities = await res.json();
            spRenderPlanTable(spActivities);
            spRenderCalendar(spActivities);
            if (spActivities.length > 0) {
                const actions = document.getElementById('sp-plan-actions');
                if (actions) actions.style.cssText = 'display:flex!important';
                spRenderTimeDistribution(spActivities);
            }
        }
    } catch (e) {}
}

// ─── Smart Calendar Engine ───────────────────────────────
let spCalendarAnchor = new Date();

function spFormatLocalDate(d) {
    if (!d) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function spSwitchCalView(view) {
    spCalendarView = view;
    const btnWeek = document.getElementById('sp-cal-btn-week');
    const btnMonth = document.getElementById('sp-cal-btn-month');
    if (btnWeek) btnWeek.classList.toggle('active', view === 'week');
    if (btnMonth) btnMonth.classList.toggle('active', view === 'month');
    spRenderCalendar(spActivities);
}

function spCalPrev() {
    if (spCalendarView === 'week') {
        spCalendarAnchor.setDate(spCalendarAnchor.getDate() - 7);
    } else {
        spCalendarAnchor.setMonth(spCalendarAnchor.getMonth() - 1);
    }
    spRenderCalendar(spActivities);
}

function spCalNext() {
    if (spCalendarView === 'week') {
        spCalendarAnchor.setDate(spCalendarAnchor.getDate() + 7);
    } else {
        spCalendarAnchor.setMonth(spCalendarAnchor.getMonth() + 1);
    }
    spRenderCalendar(spActivities);
}

function spCalToday() {
    spCalendarAnchor = new Date();
    spRenderCalendar(spActivities);
}

function spRenderCalendar(activities) {
    const container = document.getElementById('sp-calendar-container');
    const titleEl = document.getElementById('sp-cal-title');
    if (!container) return;

    const today = new Date();
    const todayStr = spFormatLocalDate(today);
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

    // Group activities by date
    const actByDate = {};
    (activities || []).forEach(a => {
        if (!actByDate[a.calendar_date]) actByDate[a.calendar_date] = [];
        actByDate[a.calendar_date].push(a);
    });

    let days = [];
    if (spCalendarView === 'week') {
        // Find Sunday of the anchor week
        const startOfWeek = new Date(spCalendarAnchor.getFullYear(), spCalendarAnchor.getMonth(), spCalendarAnchor.getDate());
        startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
        
        for (let i = 0; i < 7; i++) {
            const d = new Date(startOfWeek.getFullYear(), startOfWeek.getMonth(), startOfWeek.getDate() + i);
            days.push(d);
        }

        const endOfWeek = days[6];
        if (titleEl) {
            const startLabel = `${monthNames[days[0].getMonth()].slice(0, 3)} ${days[0].getDate()}`;
            const endLabel = `${monthNames[endOfWeek.getMonth()].slice(0, 3)} ${endOfWeek.getDate()}, ${endOfWeek.getFullYear()}`;
            titleEl.textContent = `${startLabel} – ${endLabel}`;
        }
    } else {
        // Month view
        const year = spCalendarAnchor.getFullYear();
        const month = spCalendarAnchor.getMonth();
        if (titleEl) titleEl.textContent = `${monthNames[month]} ${year}`;

        const firstDayOfMonth = new Date(year, month, 1);
        const startDayOfWeek = firstDayOfMonth.getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        // Previous month padding
        const prevMonthLastDay = new Date(year, month, 0).getDate();
        for (let i = startDayOfWeek - 1; i >= 0; i--) {
            const d = new Date(year, month - 1, prevMonthLastDay - i);
            d.isOtherMonth = true;
            days.push(d);
        }

        // Current month days
        for (let i = 1; i <= daysInMonth; i++) {
            const d = new Date(year, month, i);
            days.push(d);
        }

        // Next month padding to complete 35 or 42 grid cells
        const totalCells = days.length <= 35 ? 35 : 42;
        const remaining = totalCells - days.length;
        for (let i = 1; i <= remaining; i++) {
            const d = new Date(year, month + 1, i);
            d.isOtherMonth = true;
            days.push(d);
        }
    }

    let html = '<div class="sp-calendar-grid">';
    dayNames.forEach(d => html += `<div class="sp-cal-header">${d}</div>`);

    days.forEach(d => {
        const dateStr = spFormatLocalDate(d);
        const isToday = dateStr === todayStr;
        const dayActs = actByDate[dateStr] || [];
        const isOtherMonth = d.isOtherMonth || false;

        html += `
            <div class="sp-cal-cell ${isToday ? 'today' : ''}" style="${isOtherMonth ? 'opacity: 0.35;' : ''}">
                <div class="d-flex justify-content-between align-items-center mb-1">
                    <span class="cal-date ${isToday ? 'text-primary' : ''}">${d.getDate()}</span>
                    ${isToday ? '<span class="badge bg-primary" style="font-size: 0.55rem; padding: 1px 4px;">TODAY</span>' : ''}
                    ${dayActs.length > 0 && !isToday ? `<span class="badge bg-secondary" style="font-size: 0.55rem; padding: 1px 4px;">${dayActs.length}</span>` : ''}
                </div>
                <div class="d-flex flex-column gap-1">
        `;

        if (dayActs.length === 0) {
            html += `<div class="text-secondary" style="font-size: 0.6rem; font-style: italic;">No sessions</div>`;
        } else {
            const maxShow = spCalendarView === 'week' ? 4 : 2;
            dayActs.slice(0, maxShow).forEach(a => {
                const isCompleted = a.status === 'completed';
                const pri = (a.priority || 'medium').toLowerCase();
                const icon = isCompleted ? '✓ ' : (pri === 'high' ? '🔴 ' : (pri === 'medium' ? '🟡 ' : '🟢 '));
                
                html += `
                    <div class="cal-activity ${isCompleted ? 'done' : pri}" 
                         title="${escapeHtml(a.subject)} (${a.start_time}-${a.end_time}): ${escapeHtml(a.topic)}">
                        <span>${icon}${escapeHtml(a.subject)}</span>
                        ${spCalendarView === 'week' ? `<small style="font-size: 0.6rem; opacity: 0.85;">${a.start_time}</small>` : ''}
                    </div>
                `;
            });
            if (dayActs.length > maxShow) {
                html += `<div class="text-primary fw-bold" style="font-size: 0.62rem;">+${dayActs.length - maxShow} more</div>`;
            }
        }

        html += `
                </div>
            </div>
        `;
    });

    html += '</div>';
    container.innerHTML = html;
}

// ─── Pomodoro Timer with SVG Circle Animation ─────────────
let pomodoroTotalSeconds = 25 * 60;

function spSetPomodoroPreset(minutes) {
    if (pomodoroIsRunning) {
        clearInterval(pomodoroInterval);
        pomodoroIsRunning = false;
        pomodoroIsPaused = false;
        spSetPomodoroButtons('idle');
    }
    pomodoroTotalSeconds = minutes * 60;
    pomodoroSecondsLeft = pomodoroTotalSeconds;
    pomodoroIsBreak = minutes <= 10;
    spUpdatePomodoroDisplay();
    
    const labelEl = document.getElementById('sp-pomodoro-label');
    if (labelEl) labelEl.textContent = pomodoroIsBreak ? 'BREAK TIME' : 'FOCUS TIME';
    spShowToast(`${minutes}m timer preset activated`, '⏱️');
}

function spStartPomodoro() {
    pomodoroIsRunning = true;
    pomodoroIsPaused = false;
    pomodoroIsBreak = false;
    spUpdatePomodoroDisplay();
    spSetPomodoroButtons('running');
    const labelEl = document.getElementById('sp-pomodoro-label');
    if (labelEl) labelEl.textContent = 'FOCUS TIME';
    const gyro = document.getElementById('sp-gyro-container');
    if (gyro) gyro.classList.add('active');
    pomodoroInterval = setInterval(spPomodoroTick, 1000);
    spShowToast('Focus session started. Stay focused!', '🎯');
}

function spPausePomodoro() {
    pomodoroIsPaused = true;
    clearInterval(pomodoroInterval);
    spSetPomodoroButtons('paused');
    const gyro = document.getElementById('sp-gyro-container');
    if (gyro) gyro.classList.remove('active');
    spUpdatePomodoroDisplay();
    spShowToast('Timer paused', '⏸️');
}

function spResumePomodoro() {
    pomodoroIsPaused = false;
    spSetPomodoroButtons('running');
    const gyro = document.getElementById('sp-gyro-container');
    if (gyro) gyro.classList.add('active');
    pomodoroInterval = setInterval(spPomodoroTick, 1000);
    spUpdatePomodoroDisplay();
    spShowToast('Focus session resumed', '▶️');
}

async function spFinishPomodoro() {
    clearInterval(pomodoroInterval);
    const gyro = document.getElementById('sp-gyro-container');
    if (gyro) gyro.classList.remove('active');
    const subject = document.getElementById('sp-pomodoro-subject')?.value || 'General Study';
    const studiedMinutes = Math.max(1, Math.round((pomodoroTotalSeconds - pomodoroSecondsLeft) / 60)) || 25;

    pomodoroSessionCount++;
    pomodoroIsRunning = false;
    pomodoroIsPaused = false;
    pomodoroSecondsLeft = pomodoroTotalSeconds;

    spUpdatePomodoroDisplay();
    spSetPomodoroButtons('idle');
    const sessEl = document.getElementById('sp-pomodoro-sessions');
    if (sessEl) sessEl.textContent = `${pomodoroSessionCount} Sessions`;

    spShowToast(`Great job! ${studiedMinutes}m focus logged for ${subject}`, '🎉');

    // Record to backend
    try {
        await fetch(`${API_ROOT}/planner/pomodoro/complete`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ subject, duration_minutes: studiedMinutes })
        });
        await spLoadStreak();
        await spLoadAnalytics();
    } catch (e) {}
}

function spPomodoroTick() {
    pomodoroSecondsLeft--;
    spUpdatePomodoroDisplay();
    if (pomodoroSecondsLeft <= 0) {
        clearInterval(pomodoroInterval);
        if (!pomodoroIsBreak) {
            // Study done, start 5 min break
            pomodoroIsBreak = true;
            pomodoroTotalSeconds = 5 * 60;
            pomodoroSecondsLeft = pomodoroTotalSeconds;
            const labelEl = document.getElementById('sp-pomodoro-label');
            if (labelEl) labelEl.textContent = 'BREAK TIME';
            spShowToast('Focus block complete! Time for a 5-minute break.', '☕');
            pomodoroInterval = setInterval(spPomodoroTick, 1000);
        } else {
            // Break done
            spFinishPomodoro();
        }
    }
}

function spUpdatePomodoroDisplay() {
    const mins = Math.floor(pomodoroSecondsLeft / 60);
    const secs = pomodoroSecondsLeft % 60;
    const timeEl = document.getElementById('sp-pomodoro-time');
    if (timeEl) timeEl.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

    // SVG circle offset calculation (circumference ≈ 440)
    const circleBar = document.getElementById('sp-pomo-circle-bar');
    if (circleBar && pomodoroTotalSeconds > 0) {
        const progress = Math.max(0, Math.min(1, pomodoroSecondsLeft / pomodoroTotalSeconds));
        const offset = 440 * (1 - progress);
        circleBar.style.strokeDashoffset = offset;
        
        if (pomodoroIsBreak) {
            circleBar.style.stroke = '#10b981';
        } else if (pomodoroIsPaused) {
            circleBar.style.stroke = '#f59e0b';
        } else if (pomodoroIsRunning) {
            circleBar.style.stroke = '#ef4444';
        } else {
            circleBar.style.stroke = 'var(--primary)';
        }
    }
}

function spSetPomodoroButtons(state) {
    const start = document.getElementById('sp-pomo-start-btn');
    const pause = document.getElementById('sp-pomo-pause-btn');
    const resume = document.getElementById('sp-pomo-resume-btn');
    const finish = document.getElementById('sp-pomo-finish-btn');
    if (!start) return;
    start.classList.toggle('d-none', state !== 'idle');
    pause.classList.toggle('d-none', state !== 'running');
    resume.classList.toggle('d-none', state !== 'paused');
    finish.classList.toggle('d-none', state === 'idle');
}

// ─── Floating Toast Notification ─────────────────────────
function spShowToast(message, emoji = '💡') {
    const existing = document.querySelector('.sp-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'sp-toast';
    toast.innerHTML = `<span style="font-size: 1.2rem;">${emoji}</span> <span>${escapeHtml(message)}</span>`;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
        setTimeout(() => toast.remove(), 400);
    }, 3200);
}

// ─── Goals ───────────────────────────────────────────────
function spOpenGoalModal() { new bootstrap.Modal(document.getElementById('spGoalModal')).show(); }

async function spCreateGoal() {
    const name = document.getElementById('sp-goal-name').value.trim();
    if (!name) { alert('Enter a goal name.'); return; }
    const targetDate = document.getElementById('sp-goal-date').value || null;
    const totalTasks = parseInt(document.getElementById('sp-goal-tasks').value) || 10;

    try {
        const res = await fetch(`${API_ROOT}/planner/goals`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, target_date: targetDate, total_tasks: totalTasks })
        });
        if (res.ok) {
            bootstrap.Modal.getInstance(document.getElementById('spGoalModal')).hide();
            document.getElementById('sp-goal-name').value = '';
            await spLoadGoals();
        }
    } catch (e) {}
}

async function spLoadGoals() {
    try {
        const res = await fetch(`${API_ROOT}/planner/goals`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        if (res.ok) {
            const goals = await res.json();
            const container = document.getElementById('sp-goals-container');
            if (!container) return;
            if (goals.length === 0) {
                container.innerHTML = '<div class="text-secondary small text-center py-4">No goals yet. Click ➕ to create one!</div>';
                return;
            }
            container.innerHTML = goals.map(g => `
                <div class="sp-goal-card shadow-sm">
                    <div class="d-flex justify-content-between align-items-center mb-1">
                        <span class="fw-bold small text-truncate">🎯 ${escapeHtml(g.name)}</span>
                        <div class="d-flex gap-1">
                            ${g.status === 'active' ? `<button class="btn btn-sm btn-outline-success py-0 px-2 fw-bold" onclick="spIncrementGoal('${g.id}',${g.completed_tasks},${g.total_tasks})" title="+1 Milestone Completed"><span>+1 🏁</span></button>` : ''}
                            <button class="btn btn-sm btn-outline-danger py-0 px-2 fw-bold" onclick="spDeleteGoal('${g.id}')" title="Delete Goal"><span>🗑</span></button>
                        </div>
                    </div>
                    ${g.target_date ? `<div class="text-secondary" style="font-size:0.75rem;">📅 Target Date: <strong>${g.target_date}</strong></div>` : ''}
                    <div class="d-flex justify-content-between align-items-center mt-1 mb-1">
                        <span style="font-size:0.75rem;" class="text-secondary">🏁 ${g.completed_tasks}/${g.total_tasks} milestones done</span>
                        <span class="fw-bold small ${g.status === 'completed' ? 'text-success' : 'text-primary'}">📈 ${g.progress}%</span>
                    </div>
                    <div class="sp-goal-progress">
                        <div class="sp-goal-progress-fill" style="width: ${g.progress}%"></div>
                    </div>
                </div>
            `).join('');
        }
    } catch (e) { }
}

async function spIncrementGoal(goalId, current, total) {
    const newCompleted = Math.min(current + 1, total);
    try {
        await fetch(`${API_ROOT}/planner/goals/${goalId}`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ completed_tasks: newCompleted })
        });
        await spLoadGoals();
    } catch (e) {}
}

async function spDeleteGoal(goalId) {
    try {
        await fetch(`${API_ROOT}/planner/goals/${goalId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        await spLoadGoals();
    } catch (e) {}
}

// ─── Streak ──────────────────────────────────────────────
async function spLoadStreak() {
    try {
        const res = await fetch(`${API_ROOT}/planner/streak`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        if (res.ok) {
            const s = await res.json();
            const streakText = `🔥 ${s.current_streak} Day${s.current_streak !== 1 ? 's' : ''}`;
            const streakCountEl = document.getElementById('sp-streak-count');
            const heroStreakEl = document.getElementById('sp-hero-streak');
            if (streakCountEl) streakCountEl.textContent = streakText;
            if (heroStreakEl) heroStreakEl.textContent = streakText;
            
            const curEl = document.getElementById('sp-streak-current');
            const longEl = document.getElementById('sp-streak-longest');
            const pomoEl = document.getElementById('sp-streak-pomodoros');
            if (curEl) curEl.textContent = s.current_streak;
            if (longEl) longEl.textContent = s.longest_streak;
            if (pomoEl) pomoEl.textContent = s.total_pomodoro_sessions;
        }
    } catch (e) {}
}

// ─── Analytics ───────────────────────────────────────────
async function spLoadAnalytics() {
    try {
        const res = await fetch(`${API_ROOT}/planner/analytics`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        if (res.ok) {
            const a = await res.json();
            const plEl = document.getElementById('sp-ana-planned');
            const actEl = document.getElementById('sp-ana-actual');
            const doneEl = document.getElementById('sp-ana-done');
            const misEl = document.getElementById('sp-ana-missed');
            const scEl = document.getElementById('sp-ana-score');

            if (plEl) plEl.textContent = a.total_planned_hours + 'h';
            if (actEl) actEl.textContent = a.total_actual_hours + 'h';
            if (doneEl) doneEl.textContent = a.completed_tasks;
            if (misEl) misEl.textContent = a.missed_tasks;
            if (scEl) scEl.textContent = Math.round(a.productivity_score);

            // Weekly chart
            const chartDiv = document.getElementById('sp-weekly-chart');
            if (chartDiv && a.weekly_progress && a.weekly_progress.length > 0) {
                const maxVal = Math.max(...a.weekly_progress.map(w => Math.max(w.planned_min, w.actual_min)), 1);
                chartDiv.innerHTML = a.weekly_progress.map(w => {
                    const pH = Math.max(2, (w.planned_min / maxVal) * 60);
                    const aH = Math.max(0, (w.actual_min / maxVal) * 60);
                    const dayLabel = w.day.slice(5); // MM-DD
                    return `<div class="sp-chart-bar" style="height:70px;">
                        <div class="bar-planned" style="height:${pH}px;" title="Planned: ${w.planned_min}m"></div>
                        <div class="bar-actual" style="height:${aH}px;" title="Actual: ${w.actual_min}m"></div>
                        <div class="bar-label">${dayLabel}</div>
                    </div>`;
                }).join('');
            }
        }
    } catch (e) {}
}

// ─── Recommendations ─────────────────────────────────────
async function spLoadRecommendations() {
    const container = document.getElementById('sp-recommendations-container');
    if (!container) return;
    try {
        const res = await fetch(`${API_ROOT}/planner/recommendations`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        if (res.ok) {
            const data = await res.json();
            const recs = data.recommendations || [];
            if (recs.length === 0) {
                container.innerHTML = '<div class="text-secondary small text-center py-4">No recommendations yet. Generate your study plan first!</div>';
                return;
            }
            container.innerHTML = recs.map(r => `<div class="sp-rec-card shadow-sm"><span class="me-2">💡</span>${escapeHtml(r)}</div>`).join('');
        }
    } catch (e) {}
}

// ─── Keep old planner functions as stubs for backward compatibility ───
function onSyllabusFileSelected(event) {
    const fileInput = event.target;
    const label = document.getElementById("syllabus-filename-label");
    if (fileInput.files && fileInput.files.length > 0) label.innerText = fileInput.files[0].name;
}
async function extractSyllabusUI(event) { event.preventDefault(); }
async function loadDailyCoachReportUI() {}
async function generateStudyPlanUI(event) { event.preventDefault(); }
async function loadActiveStudyPlanUI() { await spLoadActivities(); }
function updatePlannerMetrics() {}
async function togglePlanItemComplete() {}
function openAdaptPlanModal() { spSaveProfileAndGenerate('today'); }
async function adaptStudyPlanUI() {}


// ------------------- AUDIO TEXT-TO-SPEECH & EXPORT HELPERS -------------------
function speakFlashcardText() {
    if (!("speechSynthesis" in window)) {
        alert("Text-to-Speech audio is not supported in this browser.");
        return;
    }
    window.speechSynthesis.cancel();
    
    const cardEl = document.getElementById("flashcard-element");
    const isFlipped = cardEl.classList.contains("is-flipped");
    const textToSpeak = isFlipped 
        ? document.getElementById("flashcard-answer-text").innerText 
        : document.getElementById("flashcard-question-text").innerText;

    if (!textToSpeak) return;

    const utterance = new SpeechSynthesisUtterance(textToSpeak);
    utterance.rate = 0.95;
    window.speechSynthesis.speak(utterance);
}

function getActiveNoteContent() {
    const activePane = document.querySelector("#notes-tab-content .tab-pane.active");
    return activePane ? activePane.innerText : "";
}

function copyNotesToClipboard() {
    const text = getActiveNoteContent();
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
        alert("Notes copied to clipboard!");
    });
}

function downloadNotesAsMarkdown() {
    const text = getActiveNoteContent();
    if (!text) return;

    const blob = new Blob([text], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `AI_Study_Notes_${Date.now()}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
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

// ─── 3D Interactive Tilt & Specular Reflection Engine ────
function init3DTiltEngine() {
    const cards = document.querySelectorAll('.card-3d');
    cards.forEach(card => {
        if (card.dataset.tiltAttached) return;
        card.dataset.tiltAttached = "true";

        card.addEventListener('mousemove', e => {
            const rect = card.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            const centerX = rect.width / 2;
            const centerY = rect.height / 2;
            
            const rotateX = ((y - centerY) / centerY) * -6; // max 6 deg tilt
            const rotateY = ((x - centerX) / centerX) * 6;

            card.style.transform = `perspective(1000px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) scale3d(1.015, 1.015, 1.015)`;

            const glare = card.querySelector('.glare-3d');
            if (glare) {
                const glareX = (x / rect.width) * 100;
                const glareY = (y / rect.height) * 100;
                glare.style.background = `radial-gradient(circle at ${glareX}% ${glareY}%, rgba(255,255,255,0.16) 0%, transparent 60%)`;
            }
        });

        card.addEventListener('mouseleave', () => {
            card.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)';
            const glare = card.querySelector('.glare-3d');
            if (glare) glare.style.background = '';
        });
    });
}

// Auto-initialize 3D engines on window load
window.addEventListener('DOMContentLoaded', () => {
    setTimeout(init3DTiltEngine, 300);
    setTimeout(initThreeJSHeroOrb, 300);
});

// ─── Three.js 3D Interactive WebGL Holographic Particle Sphere ────
let spThreeScene = null;
let spThreeRenderer = null;
let spThreeParticles = null;
let spThreeMesh = null;
let spThreeAnimFrame = null;

function initThreeJSHeroOrb() {
    const container = document.getElementById('sp-hero-3d-orb');
    if (!container || typeof THREE === 'undefined') return;
    if (spThreeRenderer) {
        if (!container.contains(spThreeRenderer.domElement)) {
            container.appendChild(spThreeRenderer.domElement);
        }
        return;
    }

    const width = container.clientWidth || 65;
    const height = container.clientHeight || 65;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.z = 110;

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // Create 3D Holographic Particle Sphere
    const particleCount = 450;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);

    const radius = 34;
    for (let i = 0; i < particleCount; i++) {
        const phi = Math.acos(-1 + (2 * i) / particleCount);
        const theta = Math.sqrt(particleCount * Math.PI) * phi;

        positions[i * 3] = radius * Math.cos(theta) * Math.sin(phi);
        positions[i * 3 + 1] = radius * Math.sin(theta) * Math.sin(phi);
        positions[i * 3 + 2] = radius * Math.cos(phi);

        // Cyber gradient colors (indigo to cyan)
        colors[i * 3] = 0.38;
        colors[i * 3 + 1] = 0.4 + (i / particleCount) * 0.4;
        colors[i * 3 + 2] = 0.95;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
        size: 3.2,
        vertexColors: true,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending
    });

    const particles = new THREE.Points(geometry, material);
    scene.add(particles);

    // Inner wireframe sphere
    const wireGeo = new THREE.IcosahedronGeometry(22, 1);
    const wireMat = new THREE.MeshBasicMaterial({
        color: 0x8b5cf6,
        wireframe: true,
        transparent: true,
        opacity: 0.4
    });
    const wireMesh = new THREE.Mesh(wireGeo, wireMat);
    scene.add(wireMesh);

    spThreeScene = scene;
    spThreeRenderer = renderer;
    spThreeParticles = particles;
    spThreeMesh = wireMesh;

    // Mouse tracking inertia
    let mouseX = 0;
    let mouseY = 0;
    let targetX = 0;
    let targetY = 0;

    window.addEventListener('mousemove', (e) => {
        const windowHalfX = window.innerWidth / 2;
        const windowHalfY = window.innerHeight / 2;
        mouseX = (e.clientX - windowHalfX) * 0.0008;
        mouseY = (e.clientY - windowHalfY) * 0.0008;
    });

    function animateThree() {
        spThreeAnimFrame = requestAnimationFrame(animateThree);
        
        targetX += (mouseX - targetX) * 0.05;
        targetY += (mouseY - targetY) * 0.05;

        particles.rotation.y += 0.012;
        particles.rotation.x += 0.006;
        particles.rotation.y += targetX;
        particles.rotation.x += targetY;

        wireMesh.rotation.y -= 0.008;
        wireMesh.rotation.z += 0.006;

        renderer.render(scene, camera);
    }

    animateThree();
}
