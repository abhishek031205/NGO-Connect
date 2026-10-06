const API_URL = "/api";

function getToken() {
    return localStorage.getItem("ngoConnectToken");
}

function getUser() {
    const user = localStorage.getItem("ngoConnectUser");

    try {
        return user ? JSON.parse(user) : null;
    } catch {
        return null;
    }
}

function saveLogin(token, user) {
    localStorage.setItem("ngoConnectToken", token);
    localStorage.setItem("ngoConnectUser", JSON.stringify(user));
}

function logout() {
    localStorage.removeItem("ngoConnectToken");
    localStorage.removeItem("ngoConnectUser");

    window.location.href = "login.html";
}


async function apiRequest(url, options = {}) {
    const token = getToken();

    const headers = {
        "Content-Type": "application/json",
        ...(options.headers || {})
    };

    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(`${API_URL}${url}`, {
        ...options,
        headers
    });

    let data;

    try {
        data = await response.json();
    } catch {
        data = {
            message: "Invalid server response"
        };
    }

    if (!response.ok) {
        throw new Error(data.message || "Something went wrong");
    }

    return data;
}


/* =========================
   LOGIN PAGE
========================= */

function setupLoginPage() {

    const loginForm = document.getElementById("loginForm");
    const registerForm = document.getElementById("registerForm");

    const loginTab = document.getElementById("loginTab");
    const registerTab = document.getElementById("registerTab");

    const loginSection = document.getElementById("loginSection");
    const registerSection = document.getElementById("registerSection");

    if (!loginForm || !registerForm) {
        return;
    }


    function showLogin() {

        loginSection.classList.remove("hidden");
        registerSection.classList.add("hidden");

        loginTab.classList.add("active");
        registerTab.classList.remove("active");

    }


    function showRegister() {

        loginSection.classList.add("hidden");
        registerSection.classList.remove("hidden");

        loginTab.classList.remove("active");
        registerTab.classList.add("active");

    }


    loginTab.addEventListener("click", showLogin);

    registerTab.addEventListener("click", showRegister);


    const urlParams = new URLSearchParams(window.location.search);

    if (urlParams.get("register") === "true") {
        showRegister();
    }


    /* =========================
       LOGIN
    ========================= */

    loginForm.addEventListener("submit", async function (event) {

        event.preventDefault();

        const email = document.getElementById("loginEmail").value.trim();
        const password = document.getElementById("loginPassword").value;

        const message = document.getElementById("loginMessage");

        message.textContent = "Logging in...";
        message.className = "message";


        try {

            const data = await apiRequest("/auth/login", {

                method: "POST",

                body: JSON.stringify({
                    email,
                    password
                })

            });


            saveLogin(data.token, data.user);


            message.textContent = "Login successful. Opening dashboard...";
            message.className = "message success-message";


            /*
             IMPORTANT:
             The login page and dashboard are separate HTML pages.
             Therefore we explicitly navigate to dashboard.html.
            */

            setTimeout(() => {

                window.location.href = "dashboard.html";

            }, 500);


        } catch (error) {

            message.textContent = error.message;
            message.className = "message error-message";

        }

    });


    /* =========================
       CREATE ADMIN
    ========================= */

    registerForm.addEventListener("submit", async function (event) {

        event.preventDefault();

        const name = document.getElementById("registerName").value.trim();
        const email = document.getElementById("registerEmail").value.trim();
        const password = document.getElementById("registerPassword").value;

        const message = document.getElementById("registerMessage");

        message.textContent = "Creating admin...";
        message.className = "message";


        try {

            const data = await apiRequest("/auth/register", {

                method: "POST",

                body: JSON.stringify({
                    name,
                    email,
                    password
                })

            });


            message.textContent = data.message || "Admin created successfully.";
            message.className = "message success-message";


            registerForm.reset();


            setTimeout(() => {

                showLogin();

                document.getElementById("loginEmail").value = email;

            }, 800);


        } catch (error) {

            message.textContent = error.message;
            message.className = "message error-message";

        }

    });

}


/* =========================
   DASHBOARD AUTH CHECK
========================= */

async function checkDashboardAuth() {

    const dashboard = document.querySelector(".dashboard-container");

    if (!dashboard) {
        return;
    }

    const token = getToken();

    if (!token) {

        window.location.href = "login.html";

        return;
    }


    try {

        const data = await apiRequest("/auth/me");

        const user = data.user;

        document.getElementById("adminName").textContent =
            user.name || "Admin";

        document.getElementById("welcomeName").textContent =
            user.name || "Admin";


    } catch (error) {

        localStorage.removeItem("ngoConnectToken");
        localStorage.removeItem("ngoConnectUser");

        window.location.href = "login.html";

    }

}


/* =========================
   DASHBOARD DATA
========================= */

async function loadDashboard() {

    try {

        const data = await apiRequest("/dashboard");

        const stats = data.stats;

        document.getElementById("volunteerCount").textContent =
            stats.volunteers || 0;

        document.getElementById("donorCount").textContent =
            stats.donors || 0;

        document.getElementById("donationTotal").textContent =
            `₹${Number(stats.donations || 0).toLocaleString("en-IN")}`;

        document.getElementById("projectCount").textContent =
            stats.projects || 0;

    } catch (error) {

        console.error("Dashboard error:", error);

    }

}


/* =========================
   VOLUNTEERS
========================= */

async function loadVolunteers() {

    const tableBody =
        document.getElementById("volunteerTableBody");

    if (!tableBody) {
        return;
    }


    try {

        const data = await apiRequest("/volunteers");

        const volunteers = data.volunteers || [];

        tableBody.innerHTML = "";


        if (volunteers.length === 0) {

            tableBody.innerHTML = `
                <tr>
                    <td colspan="6">
                        No volunteers added yet.
                    </td>
                </tr>
            `;

            return;
        }


        volunteers.forEach(volunteer => {

            const row = document.createElement("tr");

            row.innerHTML = `
                <td>${escapeHTML(volunteer.name)}</td>

                <td>${escapeHTML(volunteer.email)}</td>

                <td>${escapeHTML(volunteer.phone || "-")}</td>

                <td>${escapeHTML(volunteer.skills || "-")}</td>

                <td>${escapeHTML(volunteer.status || "Active")}</td>

                <td>
                    <button
                        class="delete-btn"
                        onclick="deleteVolunteer('${volunteer._id}')"
                    >
                        Delete
                    </button>
                </td>
            `;

            tableBody.appendChild(row);

        });


    } catch (error) {

        console.error("Volunteer loading error:", error);

    }

}


async function addVolunteer(event) {

    event.preventDefault();

    const message =
        document.getElementById("volunteerMessage");


    const name =
        document.getElementById("volunteerName").value.trim();

    const email =
        document.getElementById("volunteerEmail").value.trim();

    const phone =
        document.getElementById("volunteerPhone").value.trim();

    const skills =
        document.getElementById("volunteerSkills").value.trim();


    try {

        const data = await apiRequest("/volunteers", {

            method: "POST",

            body: JSON.stringify({
                name,
                email,
                phone,
                skills
            })

        });


        message.textContent =
            data.message || "Volunteer added successfully.";

        message.className =
            "message success-message";


        document.getElementById("volunteerForm").reset();


        await loadVolunteers();
        await loadDashboard();


    } catch (error) {

        message.textContent = error.message;
        message.className = "message error-message";

    }

}


async function deleteVolunteer(id) {

    try {

        await apiRequest(`/volunteers/${id}`, {

            method: "DELETE"

        });

        await loadVolunteers();
        await loadDashboard();

    } catch (error) {

        alert(error.message);

    }

}


/* =========================
   DONATIONS
========================= */

async function loadDonations() {

    const tableBody =
        document.getElementById("donationTableBody");

    if (!tableBody) {
        return;
    }


    try {

        const data = await apiRequest("/donations");

        const donations = data.donations || [];

        tableBody.innerHTML = "";


        if (donations.length === 0) {

            tableBody.innerHTML = `
                <tr>
                    <td colspan="5">
                        No donations added yet.
                    </td>
                </tr>
            `;

            return;
        }


        donations.forEach(donation => {

            const date = donation.createdAt
                ? new Date(donation.createdAt).toLocaleDateString("en-IN")
                : "-";


            const row = document.createElement("tr");

            row.innerHTML = `
                <td>${escapeHTML(donation.donorName)}</td>

                <td>
                    ₹${Number(donation.amount || 0).toLocaleString("en-IN")}
                </td>

                <td>${escapeHTML(donation.purpose || "-")}</td>

                <td>${escapeHTML(donation.paymentMethod || "-")}</td>

                <td>${date}</td>
            `;

            tableBody.appendChild(row);

        });


    } catch (error) {

        console.error("Donation loading error:", error);

    }

}


async function addDonation(event) {

    event.preventDefault();

    const message =
        document.getElementById("donationMessage");


    const donorName =
        document.getElementById("donorName").value.trim();

    const amount =
        document.getElementById("donationAmount").value;

    const purpose =
        document.getElementById("donationPurpose").value.trim();

    const paymentMethod =
        document.getElementById("paymentMethod").value;


    try {

        const data = await apiRequest("/donations", {

            method: "POST",

            body: JSON.stringify({
                donorName,
                amount: Number(amount),
                purpose,
                paymentMethod
            })

        });


        message.textContent =
            data.message || "Donation added successfully.";

        message.className =
            "message success-message";


        document.getElementById("donationForm").reset();


        await loadDonations();
        await loadDashboard();


    } catch (error) {

        message.textContent = error.message;
        message.className = "message error-message";

    }

}


/* =========================
   AI ASSISTANT
========================= */

async function sendAIMessage(event) {

    event.preventDefault();


    const input =
        document.getElementById("aiInput");

    const message =
        input.value.trim();


    if (!message) {
        return;
    }


    const chatMessages =
        document.getElementById("chatMessages");


    addChatMessage(message, "user");

    input.value = "";


    const loadingMessage =
        document.createElement("div");

    loadingMessage.className = "ai-message";

    loadingMessage.textContent =
        "Thinking...";

    chatMessages.appendChild(loadingMessage);

    chatMessages.scrollTop =
        chatMessages.scrollHeight;


    try {

        const data = await apiRequest("/ai/chat", {

            method: "POST",

            body: JSON.stringify({
                message
            })

        });


        loadingMessage.textContent =
            data.response || "No response received.";


    } catch (error) {

        loadingMessage.textContent =
            error.message;

    }


    chatMessages.scrollTop =
        chatMessages.scrollHeight;

}


function addChatMessage(message, type) {

    const chatMessages =
        document.getElementById("chatMessages");


    const div =
        document.createElement("div");


    div.className =
        type === "user"
            ? "user-message"
            : "ai-message";


    div.textContent = message;


    chatMessages.appendChild(div);


    chatMessages.scrollTop =
        chatMessages.scrollHeight;

}


/* =========================
   SECURITY
========================= */

function escapeHTML(value) {

    const div = document.createElement("div");

    div.textContent = value ?? "";

    return div.innerHTML;

}


/* =========================
   PAGE INITIALIZATION
========================= */

document.addEventListener("DOMContentLoaded", async () => {

    setupLoginPage();

    await checkDashboardAuth();


    const logoutBtn =
        document.getElementById("logoutBtn");

    if (logoutBtn) {

        logoutBtn.addEventListener("click", logout);

    }


    const volunteerForm =
        document.getElementById("volunteerForm");

    if (volunteerForm) {

        volunteerForm.addEventListener(
            "submit",
            addVolunteer
        );

        await loadVolunteers();

    }


    const donationForm =
        document.getElementById("donationForm");

    if (donationForm) {

        donationForm.addEventListener(
            "submit",
            addDonation
        );

        await loadDonations();

    }


    const aiForm =
        document.getElementById("aiForm");

    if (aiForm) {

        aiForm.addEventListener(
            "submit",
            sendAIMessage
        );

    }


    if (document.querySelector(".dashboard-container")) {

        await loadDashboard();

    }

});