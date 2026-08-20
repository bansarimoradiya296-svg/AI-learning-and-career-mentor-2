
const roadmap = {
    structure: {"phases": [{"phase_num": 1, "title": "Core Prerequisites", "milestones": ["Build basic familiarity", "Configure local environments"], "estimated_weeks": 2}, {"phase_num": 2, "title": "Framework Integration", "milestones": ["Adopt async standards", "Manage databases"], "estimated_weeks": 4}, {"phase_num": 3, "title": "Production Deployment", "milestones": ["Set up Docker containers", "Configure reverse proxies"], "estimated_weeks": 2}]},
    completion_percentage: 0.0,
    id: "uuid"
};
const phases = roadmap.structure.phases;

let html = "";
phases.forEach((phase, i) => {
    const pct = roadmap.completion_percentage || 0;
    const storedStatus = phase.status || "";
    let cardClass = "rm-phase-upcoming";
    if (storedStatus === "completed")  cardClass = "rm-phase-completed";
    else if (storedStatus === "inprogress") cardClass = "rm-phase-inprogress";

    const iconColors = ["rm-icon-blue","rm-icon-blue","rm-icon-orange","rm-icon-green"];
    const phaseIcons = ["bi-mortarboard-fill","bi-tools","bi-graph-up-arrow","bi-rocket-takeoff-fill"];
    const iconColor = iconColors[i % iconColors.length];
    const phaseIcon = phaseIcons[i % phaseIcons.length];
    
    // THIS LINE MUST BE THE CRASH!
    const milestones = (phase.milestones || []).slice(0, 4).map(m =>
        `<li><i class="bi bi-check-circle-fill text-primary" style="font-size:0.65rem;"></i>${m}</li>`
    ).join("");

    const phaseNum = phase.phase_num || (i + 1);
    const selectId = `phase-status-select-${phaseNum}`;

    html += `success phase ${phaseNum}`;
});
console.log("SUCCESS!", html);
