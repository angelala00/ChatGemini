document.addEventListener("DOMContentLoaded", () => {
    const body = document.body;
    const sidebar = document.querySelector(".sidebar");
    const collapseBtn = document.querySelector(".sidebar-collapse-btn");
    const mobileToggle = document.querySelector("[data-sidebar-toggle]");

    if (collapseBtn) {
        collapseBtn.addEventListener("click", () => {
            const shell = document.querySelector(".site-shell");
            if (shell.style.gridTemplateColumns === "0px 1fr") {
                shell.style.gridTemplateColumns = "var(--assist-sidebar-width) 1fr";
                sidebar.style.width = "var(--assist-sidebar-width)";
                sidebar.style.opacity = "1";
                sidebar.style.pointerEvents = "auto";
            } else {
                shell.style.gridTemplateColumns = "0px 1fr";
                sidebar.style.width = "0px";
                sidebar.style.opacity = "0";
                sidebar.style.pointerEvents = "none";
            }
        });
    }

    if (mobileToggle) {
        mobileToggle.addEventListener("click", () => {
            body.classList.toggle("sidebar-open");
        });
    }

    const userProfile = document.querySelector(".user-profile");
    const profileMenu = document.querySelector(".profile-menu");

    if (userProfile && profileMenu) {
        userProfile.addEventListener("click", (e) => {
            e.stopPropagation();
            profileMenu.classList.toggle("open");
        });

        document.addEventListener("click", (e) => {
            if (!profileMenu.contains(e.target) && !userProfile.contains(e.target)) {
                profileMenu.classList.remove("open");
            }
        });
    }

    const historyHeader = document.querySelector(".sidebar-section-header");
    if (historyHeader) {
        historyHeader.addEventListener("click", () => {
            const section = historyHeader.closest(".sidebar-section");
            if (section) {
                section.classList.toggle("collapsed");
            }
        });
    }

    const current = window.location.pathname.split("/").pop() || "index.html";
    document.querySelectorAll(".sidebar-link, .history-item").forEach((item) => {
        const href = item.getAttribute("href");
        if (href === current) {
            item.classList.add("active");
        }
    });
});
