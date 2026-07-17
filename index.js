const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxBZ8MG4i1iazUnxW56pfCEioSYUP9XEV8yT54MCrUAmmKfPgmeSQCUFel7MkjJWncF/exec';
const APP_PIN = "4907"; 

// Disable mouse-clicks/menus (Anti-Tampering)
document.addEventListener('contextmenu', event => event.preventDefault());

const authOverlay = document.getElementById('auth-overlay');
const pinInput = document.getElementById('pin-input');
const biometricBtn = document.getElementById('biometric-btn');
const pinError = document.getElementById('pin-error');
const appContent = document.getElementById('app-content');
const footerDock = document.getElementById('footer-dock');
const countersContainer = document.getElementById('counters-container');

// State Containers
const stateActive = document.getElementById('state-active');
const stateLunch = document.getElementById('state-lunch');
const stateClosed = document.getElementById('state-closed');
const countdownTimerEl = document.getElementById('countdown-timer');

let isTeacherAuthorized = false;
let timeOffset = 0; 

async function fetchGlobalTimeOffset() {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000); 

    try {
        const startTime = Date.now();
        const response = await fetch('https://timeapi.io/api/time/current/zone?timeZone=Asia/Kolkata', {
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (response.ok) {
            const data = await response.json();
            const serverTime = new Date(data.dateTime).getTime();
            const rtt = (Date.now() - startTime) / 2;
            
            timeOffset = (serverTime + rtt) - Date.now();
            console.log(`Global IST offset synced: ${timeOffset}ms`);
        }
    } catch (err) {
        console.warn("Global API delay. Falling back to local device clock calculation.");
        const deviceTime = new Date();
        const istString = deviceTime.toLocaleString("en-US", { timeZone: "Asia/Kolkata" });
        const istTime = new Date(istString).getTime();
        timeOffset = istTime - deviceTime.getTime();
    }
}

function getSyncedDate() {
    return new Date(Date.now() + timeOffset);
}

pinInput.addEventListener('input', () => {
    if (pinInput.value.length === 4) {
        if (pinInput.value === APP_PIN) {
            grantAccess();
        } else {
            pinInput.classList.add('shake-element');
            pinError.classList.remove('d-none');
            pinInput.value = "";
            setTimeout(() => {
                pinInput.classList.remove('shake-element');
            }, 400);
        }
    }
});

async function runBiometricScan() {
    if (!window.PublicKeyCredential) {
        alert("Native biometrics unavailable. Please type your backup PIN.");
        return;
    }
    try {
        const challenge = new Uint8Array(32);
        window.crypto.getRandomValues(challenge);
        const credentialOptions = {
            publicKey: {
                challenge: challenge,
                rp: { name: "Attendance Console" },
                user: {
                    id: new Uint8Array([1, 2, 3, 4]),
                    name: "admin",
                    displayName: "Administrator"
                },
                pubKeyCredParams: [{ type: "public-key", alg: -7 }],
                timeout: 60000,
                authenticatorSelection: { userVerification: "required" }
            }
        };
        const credential = await navigator.credentials.create(credentialOptions);
        if (credential) grantAccess();
    } catch (err) {
        console.warn("Biometric verification canceled.", err);
    }
}

biometricBtn.addEventListener('click', runBiometricScan);

function grantAccess() {
    isTeacherAuthorized = true;
    authOverlay.style.opacity = '0';
    setTimeout(() => {
        authOverlay.classList.add('d-none');
        appContent.classList.remove('d-none');
        footerDock.classList.remove('d-none');
        updateClock();
    }, 400);
}

const customRollNumbers = [];
for (let i = 1; i <= 8; i++) customRollNumbers.push(String(i).padStart(3, '0'));
for (let i = 10; i <= 52; i++) customRollNumbers.push(String(i).padStart(3, '0'));
customRollNumbers.push('302', '303', '304', '305');

const totalStudents = customRollNumbers.length;
const attendanceGrid = document.getElementById('attendance-grid');
const presentCountEl = document.getElementById('present-count');
const absentCountEl = document.getElementById('absent-count');
const submitBtn = document.getElementById('submit-btn');
const markAllBtn = document.getElementById('mark-all-btn');
const clearAllBtn = document.getElementById('clear-all-btn');
const liveTimeEl = document.getElementById('live-time');
const dynamicTitleEl = document.getElementById('dynamic-title');

let studentStatus = Array(totalStudents).fill(false);
if (localStorage.getItem('saved_attendance')) {
    try {
        studentStatus = JSON.parse(localStorage.getItem('saved_attendance'));
    } catch(e) {
        studentStatus = Array(totalStudents).fill(false);
    }
}

function saveStateLocally() {
    localStorage.setItem('saved_attendance', JSON.stringify(studentStatus));
}

function getCurrentPeriodInfo() {
    const now = getSyncedDate();
    const timeVal = now.getHours() * 100 + now.getMinutes(); 

    if (timeVal >= 930 && timeVal < 1030) return { label: "1st hour", valid: true, state: "active" };
    if (timeVal >= 1030 && timeVal < 1130) return { label: "2nd hour", valid: true, state: "active" };
    if (timeVal >= 1130 && timeVal < 1230) return { label: "3rd hour", valid: true, state: "active" };
    if (timeVal >= 1230 && timeVal < 1330) return { label: "Lunch Break", valid: false, state: "lunch" };
    if (timeVal >= 1330 && timeVal < 1430) return { label: "4th hour", valid: true, state: "active" };
    if (timeVal >= 1430 && timeVal < 1530) return { label: "5th hour", valid: true, state: "active" };
    if (timeVal >= 1530 && timeVal < 1630) return { label: "6th hour", valid: true, state: "active" };
    
    return { label: "", valid: false, state: "closed" };
}

function updateCountdownTimer() {
    const now = getSyncedDate();
    let target = new Date(now.getTime());
    target.setHours(9, 30, 0, 0);
    if (now >= target) target.setDate(target.getDate() + 1);

    const diff = target - now;
    const hours = String(Math.floor(diff / (1000 * 60 * 60))).padStart(2, '0');
    const minutes = String(Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))).padStart(2, '0');
    const seconds = String(Math.floor((diff % (1000 * 60)) / 1000)).padStart(2, '0');

    countdownTimerEl.innerText = `${hours}:${minutes}:${seconds}`;
}

function updateClock() {
    const now = getSyncedDate();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const hrs = String(now.getHours()).padStart(2, '0');
    const mins = String(now.getMinutes()).padStart(2, '0');
    
    const periodInfo = getCurrentPeriodInfo();
    const presentCount = studentStatus.filter(s => s === true).length;

    if (periodInfo.state === "active") {
        stateActive.classList.remove('d-none');
        stateLunch.classList.add('d-none');
        stateClosed.classList.add('d-none');
        footerDock.classList.remove('d-none');
        countersContainer.classList.remove('d-none');
        
        dynamicTitleEl.innerHTML = `computer vision <span class="fw-extrabold" style="color: #4f46e5;">&lt; ${periodInfo.label} &gt;</span>`;
        submitBtn.disabled = !(isTeacherAuthorized && presentCount > 0);
    } else if (periodInfo.state === "lunch") {
        stateActive.classList.add('d-none');
        stateLunch.classList.remove('d-none');
        stateClosed.classList.add('d-none');
        footerDock.classList.add('d-none');
        countersContainer.classList.add('d-none');
        
        dynamicTitleEl.innerHTML = `computer vision`;
        submitBtn.disabled = true;
    } else {
        stateActive.classList.add('d-none');
        stateLunch.classList.add('d-none');
        stateClosed.classList.remove('d-none');
        footerDock.classList.add('d-none');
        countersContainer.classList.add('d-none');
        
        dynamicTitleEl.innerHTML = `computer vision`;
        submitBtn.disabled = true;
        updateCountdownTimer();
    }

    liveTimeEl.innerHTML = `
        <svg class="me-1" width="14" height="14" fill="currentColor" viewBox="0 0 16 16">
            <path d="M8 3.5a.5.5 0 0 0-1 0V9a.5.5 0 0 0 .252.434l3.5 2a.5.5 0 0 0 .496-.868L8 8.71V3.5z"/>
            <path d="M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16zm7-8A7 7 0 1 1 1 8a7 7 0 0 1 14 0z"/>
        </svg>
        <span>${day}-${month} ${hrs}:${mins} ${periodInfo.valid ? `• <strong class="text-primary">${periodInfo.label}</strong>` : ''}</span>
    `;
    
    return {
        timestamp: `${day}-${month} ${hrs}:${mins}`,
        periodLabel: periodInfo.label,
        isValid: periodInfo.valid
    };
}
setInterval(updateClock, 1000);

function renderGrid() {
    let compiledHTML = '';
    for (let i = 0; i < totalStudents; i++) {
        const isPresent = studentStatus[i];
        const currentRoll = customRollNumbers[i];
        const isLateral = parseInt(currentRoll, 10) >= 300;
        
        const cardClass = isPresent ? 'is-present text-white' : 'text-secondary';
        const pillClass = isPresent ? 'bg-white bg-opacity-25 text-white' : 'bg-light text-secondary';
        const statusLabel = isPresent ? 'PRESENT' : 'ABSENT';

        compiledHTML += `
            <div class="col">
                <div onclick="toggleAttendance(${i})" class="student-card ${cardClass}">
                    ${isLateral ? `<span class="lateral-badge">LATERAL</span>` : ''}
                    <div class="text-uppercase fw-bold opacity-75" style="font-size: 8px; letter-spacing: 0.05em;">Roll</div>
                    <div class="h2 fw-extrabold m-0 tracking-tight py-1.5 ${isPresent ? 'text-white' : 'text-dark'}">${currentRoll}</div>
                    <span class="status-pill ${pillClass}">${statusLabel}</span>
                </div>
            </div>
        `;
    }
    attendanceGrid.innerHTML = compiledHTML;
    updateCounters();
    saveStateLocally();
}

window.toggleAttendance = function(index) {
    const periodInfo = getCurrentPeriodInfo();
    if (!periodInfo.valid) {
        alert("Attendance updates are completely locked outside active class periods.");
        return;
    }
    studentStatus[index] = !studentStatus[index];
    renderGrid();
};

markAllBtn.addEventListener('click', () => {
    const periodInfo = getCurrentPeriodInfo();
    if (!periodInfo.valid) return;
    studentStatus.fill(true);
    renderGrid();
});

clearAllBtn.addEventListener('click', () => {
    const periodInfo = getCurrentPeriodInfo();
    if (!periodInfo.valid) return;
    studentStatus.fill(false);
    renderGrid();
});

function updateCounters() {
    const presentCount = studentStatus.filter(s => s === true).length;
    presentCountEl.innerText = presentCount;
    absentCountEl.innerText = totalStudents - presentCount;

    const periodInfo = getCurrentPeriodInfo();
    if (periodInfo.state === "active") {
        submitBtn.disabled = !(isTeacherAuthorized && presentCount > 0);
    }
}

window.addEventListener('beforeunload', (e) => {
    const presentCount = studentStatus.filter(s => s === true).length;
    if (presentCount > 0) {
        e.preventDefault();
        e.returnValue = 'Work changes remain unsaved!';
    }
});

submitBtn.addEventListener('click', async () => {
    const timeData = updateClock();
    if (!timeData.isValid) {
        alert("Submission locked: No active class period is running.");
        return;
    }

    submitBtn.disabled = true;
    submitBtn.innerText = 'Connecting to Sheets...';

    const presentRollsForWhatsApp = [];
    const payload = studentStatus.map((isPresent, index) => {
        const rollNo = customRollNumbers[index];
        if (isPresent) {
            presentRollsForWhatsApp.push(parseInt(rollNo, 10)); 
        }
        // Strict text string conversion to avoid payload data collision
        return { rollNo: rollNo, status: isPresent ? 'Present' : 'Absent' };
    });

    try {
        await fetch(SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const rollNumbersString = presentRollsForWhatsApp.length > 0 ? presentRollsForWhatsApp.join(', ') : 'None';
        const whatsappMessage = `*computer vision < ${timeData.periodLabel} >*\n\n *Total Present:* ${presentRollsForWhatsApp.length}/${totalStudents}\n *Present Roll Numbers:* ${rollNumbersString}`;
        
        alert('Attendance successfully recorded inside Google Sheets!');
        
        localStorage.removeItem('saved_attendance');
        studentStatus.fill(false);
        renderGrid();

        const encodedMessage = encodeURIComponent(whatsappMessage);
        window.open(`https://api.whatsapp.com/send?text=${encodedMessage}`, '_blank');
        
    } catch (error) {
        alert("Cloud Sync Handshake Failed!");
        console.error("Sync Failure: ", error);
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = `
            <span>Sync Attendance Database</span>
            <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                <path fill-rule="evenodd" d="M1 8a.5.5 0 0 1 .5-.5h11.793l-3.147-3.146a.5.5 0 0 1 .708-.708l4 4a.5.5 0 0 1 0 .708l-4 4a.5.5 0 0 1-.708-.708L13.293 8.5H1.5A.5.5 0 0 1 1 8z"/>
            </svg>
        `;
    }
});

window.addEventListener('DOMContentLoaded', async () => {
    await fetchGlobalTimeOffset();
    setTimeout(runBiometricScan, 650);
});

renderGrid();