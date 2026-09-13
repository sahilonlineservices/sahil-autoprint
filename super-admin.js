/* =========================================================
   AUTO PRINT - SUPER ADMIN PANEL
   ========================================================= */

const db = supabaseClient;
const $ = (id) => document.getElementById(id);

let adminUser = null;

let shops = [];
let orders = [];
let wallets = [];
let devices = [];
let withdrawals = [];
let payouts = [];
let customers = [];
let jobs = [];
let notifications = [];
let auditLogs = [];
let settingsMap = {};

let toastTimer = null;

/* =========================================================
   HELPERS
   ========================================================= */

function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, (c) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    }[c]));
}

function money(value) {
    return "₹" + Number(value || 0).toFixed(2);
}

function date(value) {
    if (!value) return "-";

    const d = new Date(value);

    if (Number.isNaN(d.getTime())) return "-";

    return d.toLocaleString("en-IN");
}

function toast(message) {
    const box = $("toast");

    if (!box) {
        alert(message);
        return;
    }

    box.textContent = message;
    box.style.display = "block";

    clearTimeout(toastTimer);

    toastTimer = setTimeout(() => {
        box.style.display = "none";
    }, 3000);
}

function badge(status) {

    const s = String(status || "UNKNOWN").toUpperCase();

    const green = [
        "ACTIVE",
        "TRIAL",
        "PAID",
        "COMPLETED",
        "ONLINE",
        "READY",
        "APPROVED"
    ];

    const yellow = [
        "PENDING",
        "UNPAID",
        "QUEUED",
        "INACTIVE",
        "MAINTENANCE"
    ];

    const blue = [
        "PRINTING"
    ];

    let cls = "red";

    if (green.includes(s)) cls = "green";
    else if (yellow.includes(s)) cls = "yellow";
    else if (blue.includes(s)) cls = "blue";

    return `<span class="badge ${cls}">${esc(s)}</span>`;
}

/* =========================================================
   STATISTICS HELPERS
   All dashboard statistics use database-loaded arrays.
   Dates are calculated in India Standard Time (IST).
   ========================================================= */

function upper(value) {
    return String(value || "").trim().toUpperCase();
}

function istDateKey(value = new Date()) {

    const d = value instanceof Date
        ? value
        : new Date(value);

    if (Number.isNaN(d.getTime())) return "";

    return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }).format(d);
}

function isTodayIST(value) {
    return Boolean(value) &&
        istDateKey(value) === istDateKey(new Date());
}

function isPaidOrder(order) {
    return upper(order?.payment_status) === "PAID";
}

function isCompletedOrder(order) {
    return upper(order?.print_status) === "COMPLETED";
}

function isOnlineDevice(device, timeoutMs = 120000) {

    if (!device?.last_heartbeat_at) return false;

    const heartbeat = new Date(device.last_heartbeat_at).getTime();

    if (Number.isNaN(heartbeat)) return false;

    return Date.now() - heartbeat < timeoutMs;
}

function isQueueJob(job) {

    return [
        "QUEUED",
        "PRINT QUEUE",
        "PRINTING"
    ].includes(upper(job?.status));
}

function getShopById(shopId) {

    return shops.find(
        shop => shop.id === shopId
    );
}

/* =========================================================
   SUPER ADMIN CHECK
   ========================================================= */

async function requireSuperAdmin() {

    const { data, error } = await db.auth.getSession();

    if (error || !data.session) {
        location.href = "super-admin-login.html";
        return false;
    }

    adminUser = data.session.user;

    const result = await db
        .from("platform_admins")
        .select("user_id,email,name,active")
        .eq("user_id", adminUser.id)
        .maybeSingle();

    if (result.error) {
        console.error("Admin verification error:", result.error);
        await db.auth.signOut();
        location.href = "super-admin-login.html";
        return false;
    }

    if (!result.data || result.data.active === false) {
        await db.auth.signOut();
        location.href = "super-admin-login.html";
        return false;
    }

    if ($("adminEmail")) {
        $("adminEmail").textContent =
            adminUser.email || result.data?.email || "";
    }

    return true;
}

/* =========================================================
   SAFE DATABASE QUERY
   ========================================================= */

async function safeSelect(table, queryBuilder) {

    try {

        const result = await queryBuilder;

        if (result.error) {
            console.warn(
                `Could not load ${table}:`,
                result.error.message
            );

            return [];
        }

        return result.data || [];

    } catch (error) {

        console.warn(
            `Could not load ${table}:`,
            error
        );

        return [];
    }
}

/* =========================================================
   PLATFORM SETTINGS
   Your table:
   key TEXT
   value JSONB
   updated_at TIMESTAMP
   ========================================================= */

async function loadSettings() {
    const result = await db.from("platform_settings").select("*").eq("id", true).maybeSingle();
    if (result.error) { console.warn("Could not load platform settings:", result.error.message); settingsMap = {}; return settingsMap; }
    const row = result.data || {};
    settingsMap = {
        platform_name: row.platform_name ?? "Auto Print",
        maintenance_mode: row.maintenance_mode ?? false,
        support_phone: row.support_phone ?? "",
        support_email: row.support_email ?? "",
        default_print_price_bw: row.default_print_price_bw ?? 2,
        default_print_price_color: row.default_print_price_color ?? 10,
        latest_agent_version: row.latest_agent_version ?? "1.0.0",
        agent_update_url: row.agent_update_url ?? ""
    };
    return settingsMap;
}

function settingValue(key, fallback = null) {
    return Object.prototype.hasOwnProperty.call(settingsMap, key) ? settingsMap[key] : fallback;
}

async function saveSetting(key, value) {
    const allowed = ["platform_name","maintenance_mode","support_phone","support_email","default_print_price_bw","default_print_price_color","latest_agent_version","agent_update_url"];
    if (!allowed.includes(key)) throw new Error("Unknown platform setting: " + key);
    const patch = { [key]: value, updated_at: new Date().toISOString() };
    const result = await db.from("platform_settings").update(patch).eq("id", true);
    if (result.error) throw result.error;
    settingsMap[key] = value;
}

/* =========================================================
   LOAD EVERYTHING
   ========================================================= */

async function refresh() {

    try {

        const [
            shopsData,
            ordersData,
            walletsData,
            devicesData,
            withdrawalsData,
            payoutsData,
            customersData,
            jobsData,
            notificationsData,
            auditData
        ] = await Promise.all([

            safeSelect(
                "shops",
                db.from("shops")
                    .select("*")
                    .order("created_at", {
                        ascending: false
                    })
            ),

            safeSelect(
                "orders",
                db.from("orders")
                    .select("*")
                    .order("created_at", {
                        ascending: false
                    })
            ),

            safeSelect(
                "wallets",
                db.from("wallets").select("*")
            ),

            safeSelect(
                "devices",
                db.from("devices")
                    .select("*")
                    .order("last_heartbeat_at", {
                        ascending: false
                    })
            ),

            safeSelect(
                "withdrawal_requests",
                db.from("withdrawal_requests")
                    .select("*")
                    .order("created_at", {
                        ascending: false
                    })
            ),

            safeSelect(
                "shop_payout_details",
                db.from("shop_payout_details").select("*").order("updated_at", { ascending: false })
            ),

            safeSelect(
                "customers",
                db.from("customers")
                    .select("*")
                    .order("created_at", {
                        ascending: false
                    })
            ),

            safeSelect(
                "print_jobs",
                db.from("print_jobs")
                    .select("*")
                    .order("queued_at", {
                        ascending: true
                    })
            ),

            safeSelect(
                "notifications",
                db.from("notifications")
                    .select("*")
                    .order("created_at", {
                        ascending: false
                    })
                    .limit(100)
            ),

            safeSelect(
                "audit_logs",
                db.from("audit_logs")
                    .select("*")
                    .order("created_at", {
                        ascending: false
                    })
                    .limit(200)
            )
        ]);

        shops = shopsData;
        orders = ordersData;
        wallets = walletsData;
        devices = devicesData;
        withdrawals = withdrawalsData;
        payouts = payoutsData;
        customers = customersData;
        jobs = jobsData;
        notifications = notificationsData;
        auditLogs = auditData;

        await loadSettings();

        renderAll();

    } catch (error) {

        console.error(error);

        toast(
            "Dashboard refresh error: " +
            (error.message || error)
        );
    }
}

/* =========================================================
   DASHBOARD
   ========================================================= */

function renderAll() {

    /*
     * IMPORTANT:
     * These values are calculated only from the records loaded
     * from the Supabase database in refresh().
     */

    const totalShops =
        shops.length;

    const activeShops =
        shops.filter(
            shop => upper(shop.status) === "ACTIVE"
        ).length;

    const trialShops =
        shops.filter(
            shop => upper(shop.status) === "TRIAL"
        ).length;

    const pendingShops =
        shops.filter(
            shop => upper(shop.status) === "PENDING"
        ).length;

    const todayOrders =
        orders.filter(
            order => isTodayIST(order.created_at)
        );

    const todayPaidOrders =
        todayOrders.filter(isPaidOrder);

    const todaySales =
        todayPaidOrders.reduce(
            (sum, order) =>
                sum + Number(order.amount || 0),
            0
        );

    const completedOrders =
        orders.filter(isCompletedOrder).length;

    const failedOrders =
        orders.filter(
            order => upper(order.print_status) === "FAILED"
        ).length;

    const paidOrders =
        orders.filter(isPaidOrder).length;

    const unpaidOrders =
        orders.filter(order => !isPaidOrder(order)).length;

    /* Optional cards: only updated when the HTML contains them. */

    if ($("totalShops"))
        $("totalShops").textContent =
            totalShops;

    if ($("activeShops"))
        $("activeShops").textContent =
            activeShops;

    if ($("trialShops"))
        $("trialShops").textContent =
            trialShops;

    if ($("pendingShops"))
        $("pendingShops").textContent =
            pendingShops;

    if ($("todayOrders"))
        $("todayOrders").textContent =
            todayOrders.length;

    if ($("todaySales"))
        $("todaySales").textContent =
            money(todaySales);

    if ($("completedOrders"))
        $("completedOrders").textContent =
            completedOrders;

    if ($("failedOrders"))
        $("failedOrders").textContent =
            failedOrders;

    if ($("paidOrders"))
        $("paidOrders").textContent =
            paidOrders;

    if ($("unpaidOrders"))
        $("unpaidOrders").textContent =
            unpaidOrders;

    renderHealth();
    renderShops();
    renderOrders();
    renderCustomers();
    renderQueue();
    renderPayments();
    renderSubscriptions();
    renderWallets();
    renderWithdrawals();
    renderPayouts();
    renderDevices();
    renderQR();
    renderReports();
    renderAlerts();
    renderAudit();
    renderSettings();
}

/* =========================================================
   HEALTH
   ========================================================= */

function renderHealth() {

    if (!$("healthSummary")) return;

    /*
     * Online shop count is derived from online devices.
     * This matches the real Auto Print Agent heartbeat source.
     * A shop is counted once even if it has multiple online devices.
     */
    const onlineShopIds =
        new Set(
            devices
                .filter(device => isOnlineDevice(device, 120000))
                .map(device => device.shop_id)
                .filter(Boolean)
        );

    const onlineShops =
        onlineShopIds.size;

    const onlineDevices =
        devices.filter(
            device => isOnlineDevice(device, 120000)
        ).length;

    const printerErrors =
        devices.filter(
            device =>
                upper(device.printer_status) === "ERROR"
        ).length;

    /*
     * Queue statistics come from print_jobs, not only orders.
     * Payment must also be PAID before a job is treated as a paid queue item.
     */
    const queued =
        jobs.filter(job => {

            if (!isQueueJob(job)) return false;

            const order =
                orders.find(
                    item => item.id === job.order_id
                );

            return isPaidOrder(order);

        }).length;

    $("healthSummary").innerHTML = `
        <p>Shops online recently:
            <strong>${onlineShops}</strong>
        </p>

        <p>Devices online:
            <strong>${onlineDevices}</strong>
        </p>

        <p>Printer errors:
            <strong>${printerErrors}</strong>
        </p>

        <p>Paid queued prints:
            <strong>${queued}</strong>
        </p>
    `;
}

/* =========================================================
   SHOPS
   ========================================================= */

function renderShops() {

    const body = $("shopsBody");

    if (!body) return;

    const search =
        ($("shopSearch")?.value || "")
            .trim()
            .toLowerCase();

    const status =
        $("shopStatus")?.value || "all";

    const list = shops.filter(shop => {

        const text = [
            shop.shop_id,
            shop.shop_name,
            shop.owner_name,
            shop.email,
            shop.mobile
        ]
            .map(v => String(v || "").toLowerCase())
            .join(" ");

        const searchOK =
            !search || text.includes(search);

        const statusOK =
            status === "all" ||
            String(shop.status || "").toLowerCase() ===
            status.toLowerCase();

        return searchOK && statusOK;
    });

    if (!list.length) {

        body.innerHTML = `
            <tr>
                <td colspan="8" class="empty">
                    No shops found.
                </td>
            </tr>
        `;

        return;
    }

    body.innerHTML = list.map(shop => {

        const id = esc(shop.id);

        return `
        <tr>

            <td>
                <strong>
                    ${esc(shop.shop_name || "-")}
                </strong>

                <br>

                <small>
                    ${esc(shop.shop_id || "-")}
                </small>
            </td>

            <td>
                ${esc(shop.owner_name || "-")}
            </td>

            <td>
                ${esc(shop.mobile || "-")}
                <br>
                <small>
                    ${esc(shop.email || "-")}
                </small>
            </td>

            <td>
                ${badge(shop.status)}
            </td>

            <td>
                ${esc(shop.platform_plan || "commercial")}
            </td>

            <td>
                ${esc(shop.autopay_status || "not_configured")}
            </td>

            <td>
                ${date(shop.last_seen_at)}
            </td>

            <td>

                <select
                    class="shop-action"
                    data-id="${id}"
                >

                    <option value="">
                        Change status
                    </option>

                    <option value="trial">
                        Trial
                    </option>

                    <option value="active">
                        Activate
                    </option>

                    <option value="inactive">
                        Deactivate
                    </option>

                    <option value="suspended">
                        Suspend
                    </option>

                    <option value="blocked">
                        Block
                    </option>

                    <option value="maintenance">
                        Maintenance
                    </option>

                </select>

            </td>

        </tr>
        `;
    }).join("");

    document
        .querySelectorAll(".shop-action")
        .forEach(select => {

            select.addEventListener(
                "change",
                () => changeShop(
                    select.dataset.id,
                    select.value
                )
            );

        });
}

/* =========================================================
   CHANGE SHOP STATUS
   ========================================================= */

async function changeShop(id, status) {

    if (!status) return;

    const patch = {
        status: status
    };

    if (status === "trial") {

        const now = new Date();

        patch.trial_started_at =
            now.toISOString();

        patch.trial_ends_at =
            new Date(
                now.getTime() +
                2 * 24 * 60 * 60 * 1000
            ).toISOString();
    }

    const result = await db
        .from("shops")
        .update(patch)
        .eq("id", id);

    if (result.error) {

        toast(
            "Shop update failed: " +
            result.error.message
        );

        return;
    }

    await writeAudit(
        "SHOP_STATUS_CHANGED",
        "shop",
        id,
        { status }
    );

    toast("Shop status updated");

    await refresh();
}

/* =========================================================
   ADD SHOP UI
   ========================================================= */

function ensureAddShopUI() {

    const panel = $("panel-shops");

    if (!panel) return;

    if ($("addShopButton")) return;

    const header =
        panel.querySelector(".panel-head");

    if (!header) {

        console.error(
            "Shop panel header not found."
        );

        return;
    }

    header.style.display = "flex";
    header.style.alignItems = "center";
    header.style.justifyContent = "space-between";

    const button =
        document.createElement("button");

    button.id = "addShopButton";
    button.type = "button";
    button.className = "primary-btn";
    button.textContent = "+ Add Shop";

    header.appendChild(button);

    const modal =
        document.createElement("div");

    modal.id = "addShopModal";

    modal.style.cssText = `
        display:none;
        position:fixed;
        inset:0;
        z-index:99999;
        background:rgba(0,0,0,.55);
        padding:20px;
        align-items:center;
        justify-content:center;
    `;

    modal.innerHTML = `

        <div
            style="
                width:100%;
                max-width:560px;
                background:#fff;
                border-radius:18px;
                padding:25px;
                box-shadow:0 25px 80px rgba(0,0,0,.3);
                max-height:90vh;
                overflow:auto;
            "
        >

            <div
                style="
                    display:flex;
                    align-items:center;
                    justify-content:space-between;
                    margin-bottom:20px;
                "
            >

                <h2 style="margin:0">
                    Add New Shop
                </h2>

                <button
                    type="button"
                    id="closeAddShop"
                    class="light-btn"
                >
                    ✕
                </button>

            </div>

            <form id="addShopForm">

                <div class="field">

                    <label>
                        Shop Name *
                    </label>

                    <input
                        id="newShopName"
                        required
                        maxlength="120"
                        placeholder="Enter shop name"
                    >

                </div>

                <div class="field">

                    <label>
                        Owner Name *
                    </label>

                    <input
                        id="newOwnerName"
                        required
                        maxlength="120"
                        placeholder="Enter owner name"
                    >

                </div>

                <div class="field">

                    <label>
                        Mobile Number *
                    </label>

                    <input
                        id="newShopMobile"
                        required
                        maxlength="15"
                        inputmode="tel"
                        placeholder="Enter mobile number"
                    >

                </div>

                <div class="field">

                    <label>
                        Email
                    </label>

                    <input
                        id="newShopEmail"
                        type="email"
                        maxlength="160"
                        placeholder="Enter email"
                    >

                </div>

                <div class="field">

                    <label>
                        Shop Address
                    </label>

                    <textarea
                        id="newShopAddress"
                        rows="3"
                        maxlength="500"
                        placeholder="Enter shop address"
                    ></textarea>

                </div>

                <div
                    style="
                        display:grid;
                        grid-template-columns:1fr 1fr;
                        gap:12px;
                    "
                >

                    <div class="field">

                        <label>
                            Plan
                        </label>

                        <select id="newShopPlan">

                            <option value="commercial">
                                Commercial
                            </option>

                            <option value="trial">
                                Trial
                            </option>

                        </select>

                    </div>

                    <div class="field">

                        <label>
                            Status
                        </label>

                        <select id="newShopStatus">

                            <option value="active">
                                Active
                            </option>

                            <option value="trial">
                                Trial
                            </option>

                            <option value="pending">
                                Pending
                            </option>

                            <option value="inactive">
                                Inactive
                            </option>

                        </select>

                    </div>

                </div>

                <div
                    id="addShopMessage"
                    style="
                        margin-top:12px;
                        min-height:20px;
                    "
                ></div>

                <div
                    style="
                        display:flex;
                        gap:10px;
                        justify-content:flex-end;
                        margin-top:20px;
                    "
                >

                    <button
                        type="button"
                        id="cancelAddShop"
                        class="light-btn"
                    >
                        Cancel
                    </button>

                    <button
                        type="submit"
                        id="saveNewShop"
                        class="primary-btn"
                    >
                        Create Shop
                    </button>

                </div>

            </form>

        </div>
    `;

    document.body.appendChild(modal);

    const closeModal = () => {

        modal.style.display = "none";

        $("addShopForm")?.reset();

        $("addShopMessage").textContent = "";

        $("saveNewShop").disabled = false;

        $("saveNewShop").textContent =
            "Create Shop";
    };

    button.onclick = () => {

        modal.style.display = "flex";

        $("newShopName")?.focus();
    };

    $("closeAddShop").onclick =
        closeModal;

    $("cancelAddShop").onclick =
        closeModal;

    modal.onclick = event => {

        if (event.target === modal) {
            closeModal();
        }
    };

    $("addShopForm").onsubmit =
        async event => {

            event.preventDefault();

            const shopName =
                $("newShopName")
                    .value
                    .trim();

            const ownerName =
                $("newOwnerName")
                    .value
                    .trim();

            const mobile =
                $("newShopMobile")
                    .value
                    .trim();

            const email =
                $("newShopEmail")
                    .value
                    .trim()
                    .toLowerCase();

            const address =
                $("newShopAddress")
                    .value
                    .trim();

            const plan =
                $("newShopPlan").value;

            const status =
                $("newShopStatus").value;

            const message =
                $("addShopMessage");

            if (
                !shopName ||
                !ownerName ||
                !mobile
            ) {

                message.textContent =
                    "Shop name, owner name and mobile are required.";

                return;
            }

            const save =
                $("saveNewShop");

            save.disabled = true;

            save.textContent =
                "Creating...";

            message.textContent =
                "Saving shop...";

            try {

                const base =
                    shopName
                        .toUpperCase()
                        .replace(/[^A-Z0-9]+/g, "")
                        .slice(0, 8) ||
                    "SHOP";

                const suffix =
                    Math.random()
                        .toString(36)
                        .slice(2, 8)
                        .toUpperCase();

                const shopId =
                    `${base}-${suffix}`;

                const row = {

                    shop_id: shopId,

                    shop_name:
                        shopName,

                    owner_name:
                        ownerName,

                    mobile:
                        mobile,

                    email:
                        email || null,

                    address:
                        address || null,

                    platform_plan:
                        plan,

                    status:
                        status,

                    qr_slug:
                        `${base.toLowerCase()}-${suffix.toLowerCase()}`
                };

                if (status === "trial") {

                    const now =
                        new Date();

                    row.trial_started_at =
                        now.toISOString();

                    row.trial_ends_at =
                        new Date(
                            now.getTime() +
                            2 * 24 * 60 * 60 * 1000
                        ).toISOString();
                }

                const result =
                    await db
                        .from("shops")
                        .insert(row)
                        .select("*")
                        .single();

                if (result.error) {
                    throw result.error;
                }

                await writeAudit(
                    "SHOP_CREATED",
                    "shop",
                    result.data.id,
                    {
                        shop_id:
                            result.data.shop_id,

                        shop_name:
                            result.data.shop_name
                    }
                );

                toast(
                    "Shop created successfully!"
                );

                closeModal();

                await refresh();

            } catch (error) {

                console.error(
                    "ADD SHOP ERROR:",
                    error
                );

                message.textContent =
                    error.message ||
                    "Could not create shop.";

                save.disabled = false;

                save.textContent =
                    "Create Shop";
            }
        };
}

/* =========================================================
   ORDERS
   ========================================================= */

function renderOrders() {

    const body =
        $("adminOrdersBody");

    if (!body) return;

    const q =
        ($("adminOrderSearch")?.value || "")
            .toLowerCase();

    const status =
        $("adminOrderStatus")?.value ||
        "all";

    const payment =
        $("adminPay")?.value ||
        "all";

    const list =
        orders.filter(order => {

            const shop =
                shops.find(
                    s => s.id === order.shop_id
                );

            const text = [
                order.order_number,
                order.order_id,
                order.customer_mobile,
                order.file_name,
                order.front_file_name,
                order.back_file_name,
                shop?.shop_name,
                shop?.shop_id
            ]
                .map(v =>
                    String(v || "")
                        .toLowerCase()
                )
                .join(" ");

            return (
                (!q || text.includes(q)) &&
                (
                    status === "all" ||
                    String(order.print_status || "")
                        .toUpperCase() === status
                ) &&
                (
                    payment === "all" ||
                    String(order.payment_status || "")
                        .toUpperCase() === payment
                )
            );
        });

    if (!list.length) {

        body.innerHTML = `
            <tr>
                <td colspan="8" class="empty">
                    No orders found.
                </td>
            </tr>
        `;

        return;
    }

    body.innerHTML =
        list.map(order => {

            const shop =
                shops.find(
                    s => s.id === order.shop_id
                );

            return `
            <tr>

                <td>
                    <strong>
                        ${esc(
                            order.order_number ||
                            order.order_id ||
                            "-"
                        )}
                    </strong>

                    <br>

                    <small>
                        ${date(order.created_at)}
                    </small>
                </td>

                <td>
                    ${esc(
                        shop?.shop_name ||
                        order.shop_id ||
                        "-"
                    )}
                </td>

                <td>
                    ${esc(
                        order.customer_mobile ||
                        "-"
                    )}
                </td>

                <td>
                    ${
                        order.print_mode === "id_card"
                            ? "ID Card"
                            : "Single Page"
                    }

                    ${
                        order.id_document_type
                            ? " • " +
                              esc(order.id_document_type)
                            : ""
                    }

                    •

                    ${
                        order.print_type === "color"
                            ? "Color"
                            : "B&W"
                    }

                    • A4
                </td>

                <td>
                    ${money(order.amount)}
                </td>

                <td>
                    ${badge(order.payment_status)}
                </td>

                <td>
                    ${badge(order.print_status)}
                </td>

                <td>

                    ${
                        order.payment_status !== "PAID" &&
                        !["COMPLETED", "CANCELLED"]
                            .includes(
                                String(order.print_status || "")
                                    .toUpperCase()
                            )
                            ?

                        `
                        <button
                            class="btn-sm primary-btn"
                            onclick="adminPay('${esc(order.id)}')"
                        >
                            Mark Paid & Queue
                        </button>
                        `
                        : ""
                    }

                    ${
                        String(order.print_status || "")
                            .toUpperCase() === "FAILED"

                            ?

                        `
                        <button
                            class="btn-sm light-btn"
                            onclick="adminQueue('${esc(order.id)}')"
                        >
                            Retry
                        </button>
                        `
                        : ""
                    }

                </td>

            </tr>
            `;
        }).join("");
}

/* =========================================================
   ORDER ACTIONS
   ========================================================= */

window.adminPay = async function(id) {

    const result =
        await db
            .from("orders")
            .update({
                payment_status: "PAID",
                paid_at:
                    new Date().toISOString(),
                print_status: "QUEUED"
            })
            .eq("id", id);

    if (result.error) {

        toast(
            "Payment update failed: " +
            result.error.message
        );

        return;
    }

    toast(
        "Payment recorded and order queued"
    );

    await refresh();
};

window.adminQueue = async function(id) {

    const result =
        await db
            .from("orders")
            .update({
                print_status: "QUEUED",
                error_message: null
            })
            .eq("id", id);

    if (result.error) {

        toast(
            "Queue update failed: " +
            result.error.message
        );

        return;
    }

    toast("Order queued");

    await refresh();
};

/* =========================================================
   CUSTOMERS
   ========================================================= */

function renderCustomers() {

    const body =
        $("customersBody");

    if (!body) return;

    const q =
        ($("customerSearch")?.value || "")
            .toLowerCase();

    const list =
        customers.filter(customer => {

            const shop =
                shops.find(
                    s => s.id === customer.shop_id
                );

            const text = [
                customer.name,
                customer.mobile,
                customer.email,
                shop?.shop_name,
                shop?.shop_id
            ]
                .map(v =>
                    String(v || "")
                        .toLowerCase()
                )
                .join(" ");

            return !q || text.includes(q);
        });

    if (!list.length) {

        body.innerHTML = `
            <tr>
                <td colspan="7" class="empty">
                    No customers found.
                </td>
            </tr>
        `;

        return;
    }

    body.innerHTML =
        list.map(customer => {

            const shop =
                shops.find(
                    s => s.id === customer.shop_id
                );

            const customerOrders =
                orders.filter(order =>

                    (
                        order.customer_id ===
                        customer.id
                    )

                    ||

                    (
                        String(
                            order.customer_mobile || ""
                        ) ===
                        String(
                            customer.mobile || ""
                        )

                        &&

                        order.shop_id ===
                        customer.shop_id
                    )
                );

            const total =
                customerOrders.reduce(
                    (sum, order) =>
                        sum +
                        Number(order.amount || 0),
                    0
                );

            return `
            <tr>

                <td>
                    <strong>
                        ${esc(
                            customer.name ||
                            "Customer"
                        )}
                    </strong>
                </td>

                <td>
                    ${esc(
                        customer.mobile || "-"
                    )}
                </td>

                <td>
                    ${esc(
                        customer.email || "-"
                    )}
                </td>

                <td>
                    ${esc(
                        shop?.shop_name || "-"
                    )}

                    <br>

                    <small>
                        ${esc(
                            shop?.shop_id || ""
                        )}
                    </small>
                </td>

                <td>
                    ${customerOrders.length}
                </td>

                <td>
                    ${money(total)}
                </td>

                <td>
                    ${date(
                        customer.created_at
                    )}
                </td>

            </tr>
            `;
        }).join("");
}

/* =========================================================
   PAYMENTS
   ========================================================= */

function renderPayments() {

    if (!$("paidCount")) return;

    const paid =
        orders.filter(
            o =>
                String(o.payment_status || "")
                    .toUpperCase() === "PAID"
        );

    const unpaid =
        orders.filter(
            o =>
                String(o.payment_status || "")
                    .toUpperCase() !== "PAID"
        );

    const value =
        paid.reduce(
            (sum, order) =>
                sum + Number(order.amount || 0),
            0
        );

    $("paidCount").textContent =
        paid.length;

    $("unpaidCount").textContent =
        unpaid.length;

    $("paidValue").textContent =
        money(value);
}

/* =========================================================
   SUBSCRIPTIONS
   ========================================================= */

function renderSubscriptions() {

    const body =
        $("subsBody");

    if (!body) return;

    if (!shops.length) {

        body.innerHTML = `
            <tr>
                <td colspan="7" class="empty">
                    No shops.
                </td>
            </tr>
        `;

        return;
    }

    body.innerHTML =
        shops.map(shop => {

            const status =
                String(
                    shop.status || ""
                ).toLowerCase();

            return `
            <tr>

                <td>
                    ${esc(shop.shop_name || "-")}
                    <br>
                    <small>
                        ${esc(shop.shop_id || "-")}
                    </small>
                </td>

                <td>
                    ${esc(
                        shop.platform_plan ||
                        "commercial"
                    )}
                </td>

                <td>
                    ${badge(shop.status)}
                </td>

                <td>
                    ${date(
                        shop.trial_ends_at
                    )}
                </td>

                <td>
                    ${date(
                        shop.next_billing_at
                    )}
                </td>

                <td>
                    ${
                        shop.renewal_required
                            ? "Yes"
                            : "No"
                    }
                </td>

                <td>

                    ${
                        [
                            "pending",
                            "inactive",
                            "suspended"
                        ].includes(status)

                        ?

                        `
                        <button
                            class="btn-sm primary-btn"
                            onclick="activateTrial('${esc(shop.id)}')"
                        >
                            Start 2-Day Trial
                        </button>
                        `

                        : "-"
                    }

                </td>

            </tr>
            `;
        }).join("");
}

window.activateTrial =
    async function(id) {

        const now =
            new Date();

        const end =
            new Date(
                now.getTime() +
                2 * 24 * 60 * 60 * 1000
            );

        const result =
            await db
                .from("shops")
                .update({
                    status: "trial",
                    trial_started_at:
                        now.toISOString(),
                    trial_ends_at:
                        end.toISOString()
                })
                .eq("id", id);

        if (result.error) {

            toast(
                "Trial update failed: " +
                result.error.message
            );

            return;
        }

        toast(
            "2-day trial started"
        );

        await refresh();
    };

/* =========================================================
   WALLETS
   ========================================================= */

function renderWallets() {

    const body =
        $("walletsBody");

    if (!body) return;

    if (!shops.length) {

        body.innerHTML = `
            <tr>
                <td colspan="4" class="empty">
                    No wallets.
                </td>
            </tr>
        `;

        return;
    }

    body.innerHTML =
        shops.map(shop => {

            const wallet =
                wallets.find(
                    w => w.shop_id === shop.id
                );

            return `
            <tr>

                <td>
                    ${esc(
                        shop.shop_name || "-"
                    )}
                </td>

                <td>
                    ${money(
                        wallet?.balance
                    )}
                </td>

                <td>
                    ${money(
                        wallet?.pending_balance
                    )}
                </td>

                <td>
                    ${date(
                        wallet?.updated_at
                    )}
                </td>

            </tr>
            `;
        }).join("");
}


/* =========================================================
   PAYOUT DETAILS
   ========================================================= */
function renderPayouts(){
 const body=$("payoutsBody"); if(!body)return;
 body.innerHTML=(payouts||[]).map(x=>{const sh=shops.find(s=>s.id===x.shop_id);const dest=x.payout_method==='UPI'?(x.upi_id||'-'):(x.bank_name?x.bank_name+' / '+x.account_number:'-');return `<tr><td>${esc(sh?.shop_name||x.shop_id)}</td><td>${esc(x.payout_method)}</td><td>${esc(x.account_holder_name||'-')}</td><td>${esc(dest)}</td><td>${badge(x.verification_status)}</td><td><button class="btn-sm primary-btn" onclick="verifyPayout('${esc(x.shop_id)}','VERIFIED')">Verify</button> <button class="btn-sm danger-btn" onclick="verifyPayout('${esc(x.shop_id)}','REJECTED')">Reject</button></td></tr>`}).join('')||'<tr><td colspan="6" class="empty">No payout details.</td></tr>';
}
window.verifyPayout=async function(shopId,status){const note=prompt('Verification note (optional):','');const r=await db.rpc('verify_shop_payout',{p_shop_id:shopId,p_status:status,p_note:note||null});if(r.error){toast('Payout verification failed: '+r.error.message);return;}toast('Payout '+status.toLowerCase());await refresh();};

/* =========================================================
   WITHDRAWALS
   ========================================================= */

function renderWithdrawals() {

    const body =
        $("withdrawalsBody");

    if (!body) return;

    if (!withdrawals.length) {

        body.innerHTML = `
            <tr>
                <td colspan="6" class="empty">
                    No withdrawals.
                </td>
            </tr>
        `;

        return;
    }

    body.innerHTML =
        withdrawals.map(item => {

            const shop =
                shops.find(
                    s => s.id === item.shop_id
                );

            const pending =
                String(item.status || "")
                    .toUpperCase() === "PENDING";

            return `
            <tr>

                <td>
                    ${date(
                        item.created_at
                    )}
                </td>

                <td>
                    ${esc(
                        shop?.shop_name ||
                        item.shop_id ||
                        "-"
                    )}
                </td>

                <td>
                    ${money(item.amount)}
                </td>

                <td>
                    ${badge(item.status)}
                </td>

                <td>
                    ${esc(
                        item.note || "-"
                    )}
                </td>

                <td>

                    ${
                        pending

                        ?

                        `
                        <button
                            class="btn-sm primary-btn"
                            onclick="approveWithdrawal('${esc(item.id)}')"
                        >
                            Approve
                        </button>

                        <button
                            class="btn-sm danger-btn"
                            onclick="rejectWithdrawal('${esc(item.id)}')"
                        >
                            Reject
                        </button>
                        `

                        : "-"
                    }

                </td>

            </tr>
            `;
        }).join("");
}

window.approveWithdrawal =
    async function(id) {

        const result =
            await db
                .from("withdrawal_requests")
                .update({
                    status: "APPROVED",
                    processed_at:
                        new Date().toISOString()
                })
                .eq("id", id)
                .eq("status", "PENDING");

        if (result.error) {

            toast(
                "Approval failed: " +
                result.error.message
            );

            return;
        }

        toast(
            "Withdrawal approved"
        );

        await refresh();
    };

window.rejectWithdrawal =
    async function(id) {

        const result =
            await db
                .from("withdrawal_requests")
                .update({
                    status: "REJECTED",
                    processed_at:
                        new Date().toISOString()
                })
                .eq("id", id)
                .eq("status", "PENDING");

        if (result.error) {

            toast(
                "Rejection failed: " +
                result.error.message
            );

            return;
        }

        toast(
            "Withdrawal rejected"
        );

        await refresh();
    };

/* =========================================================
   DEVICES
   ========================================================= */

function renderDevices() {

    const body =
        $("devicesBody");

    if (!body) return;

    if (!devices.length) {

        body.innerHTML = `
            <tr>
                <td colspan="8" class="empty">
                    No devices.
                </td>
            </tr>
        `;

        return;
    }

    body.innerHTML =
        devices.map(device => {

            const shop =
                shops.find(
                    s => s.id === device.shop_id
                );

            return `
            <tr>

                <td>
                    ${esc(
                        shop?.shop_name ||
                        device.shop_id ||
                        "-"
                    )}
                </td>

                <td>
                    ${esc(
                        device.device_name ||
                        "-"
                    )}
                </td>

                <td>
                    ${badge(
                        device.internet_status ||
                        "OFFLINE"
                    )}
                </td>

                <td>
                    ${badge(
                        device.printer_status ||
                        "UNKNOWN"
                    )}
                </td>

                <td>
                    ${esc(
                        device.internet_status ||
                        "-"
                    )}
                </td>

                <td>
                    ${device.queue_count ?? 0}
                </td>

                <td>
                    ${date(
                        device.last_heartbeat_at
                    )}
                </td>

                <td>
                    ${esc(
                        device.app_version ||
                        "-"
                    )}
                </td>

            </tr>
            `;
        }).join("");
}

/* =========================================================
   QR
   ========================================================= */

function renderQR() {

    const body =
        $("qrBody");

    if (!body) return;

    if (!shops.length) {

        body.innerHTML = `
            <tr>
                <td colspan="4" class="empty">
                    No shops.
                </td>
            </tr>
        `;

        return;
    }

    const basePath =
        location.pathname.replace(
            /[^/]+$/,
            ""
        );

    body.innerHTML =
        shops.map(shop => {

            const slug =
                shop.qr_slug ||
                shop.shop_id ||
                "";

            const link =
                `${location.origin}${basePath}index.html?shop=${encodeURIComponent(slug)}`;

            return `
            <tr>

                <td>
                    ${esc(
                        shop.shop_name || "-"
                    )}
                </td>

                <td>
                    ${esc(
                        shop.shop_id || "-"
                    )}
                </td>

                <td>
                    ${esc(slug)}
                </td>

                <td>
                    <a
                        href="${esc(link)}"
                        target="_blank"
                        rel="noopener"
                    >
                        Open Customer Link
                    </a>
                </td>

            </tr>
            `;
        }).join("");
}

/* =========================================================
   REPORTS
   ========================================================= */

function renderReports() {

    if ($("repOrders"))
        $("repOrders").textContent =
            orders.length;

    if ($("repCompleted"))
        $("repCompleted").textContent =
            orders.filter(
                o =>
                    String(o.print_status || "")
                        .toUpperCase() === "COMPLETED"
            ).length;

    if ($("repValue"))
        $("repValue").textContent =
            money(
                orders
                    .filter(isPaidOrder)
                    .reduce(
                        (sum, order) =>
                            sum +
                            Number(order.amount || 0),
                        0
                    )
            );

    const body =
        $("reportBody");

    if (!body) return;

    body.innerHTML =
        shops.map(shop => {

            const shopOrders =
                orders.filter(
                    o => o.shop_id === shop.id
                );

            const completed =
                shopOrders.filter(
                    o =>
                        String(
                            o.print_status || ""
                        ).toUpperCase() ===
                        "COMPLETED"
                );

            const sales =
                shopOrders
                    .filter(
                        o =>
                            String(
                                o.payment_status || ""
                            ).toUpperCase() ===
                            "PAID"
                    )
                    .reduce(
                        (sum, order) =>
                            sum +
                            Number(order.amount || 0),
                        0
                    );

            return `
            <tr>

                <td>
                    ${esc(
                        shop.shop_name || "-"
                    )}
                </td>

                <td>
                    ${shopOrders.length}
                </td>

                <td>
                    ${completed.length}
                </td>

                <td>
                    ${money(sales)}
                </td>

            </tr>
            `;
        }).join("");
}

/* =========================================================
   ALERTS
   ========================================================= */

function renderAlerts() {

    const box =
        $("alertsBox");

    if (!box) return;

    const stale =
        devices.filter(
            device =>
                !device.last_heartbeat_at ||
                Date.now() -
                new Date(
                    device.last_heartbeat_at
                ).getTime() >
                300000
        );

    let html = "";

    stale.forEach(device => {

        const shop =
            shops.find(
                s => s.id === device.shop_id
            );

        html += `
            <div class="price-box">

                ${badge("OFFLINE")}

                <span>

                    ${esc(
                        shop?.shop_name ||
                        "Shop"
                    )}

                    /

                    ${esc(
                        device.device_name ||
                        "Device"
                    )}

                    — Last seen:

                    ${date(
                        device.last_heartbeat_at
                    )}

                </span>

            </div>
        `;
    });

    notifications
        .slice(0, 30)
        .forEach(note => {

            html += `
                <div class="price-box">

                    <div>

                        <strong>
                            ${esc(
                                note.title ||
                                "Alert"
                            )}
                        </strong>

                        <div>
                            ${esc(
                                note.message ||
                                ""
                            )}
                        </div>

                    </div>

                </div>
            `;
        });

    box.innerHTML =
        html ||
        `<div class="empty">
            No alerts.
        </div>`;

    if ($("dashAlerts")) {

        $("dashAlerts").innerHTML =
            stale.length

                ?

                stale
                    .slice(0, 8)
                    .map(device => `
                        <p>
                            ${badge("ALERT")}

                            ${esc(
                                device.device_name ||
                                "Device"
                            )}

                            —

                            ${esc(
                                device.last_error ||
                                "Device offline/stale"
                            )}
                        </p>
                    `)
                    .join("")

                :

                `<p>
                    No critical device alerts.
                </p>`;
    }
}

/* =========================================================
   AUDIT
   ========================================================= */

function renderAudit() {

    const body =
        $("auditBody");

    if (!body) return;

    if (!auditLogs.length) {

        body.innerHTML = `
            <tr>
                <td colspan="6" class="empty">
                    No audit logs.
                </td>
            </tr>
        `;

        return;
    }

    body.innerHTML =
        auditLogs.map(log => {

            const shop =
                shops.find(
                    s => s.id === log.shop_id
                );

            return `
            <tr>

                <td>
                    ${date(
                        log.created_at
                    )}
                </td>

                <td>
                    ${esc(
                        shop?.shop_name ||
                        "-"
                    )}
                </td>

                <td>
                    ${esc(
                        log.actor_user_id ||
                        "-"
                    )}
                </td>

                <td>
                    ${esc(
                        log.action ||
                        "-"
                    )}
                </td>

                <td>
                    ${esc(
                        log.entity_type ||
                        "-"
                    )}
                </td>

                <td>
                    ${esc(
                        JSON.stringify(
                            log.details || {}
                        )
                    )}
                </td>

            </tr>
            `;
        }).join("");
}

/* =========================================================
   PRINT QUEUE
   ========================================================= */

function renderQueue() {

    const body =
        $("queueBody");

    if (!body) return;

    const q =
        ($("queueSearch")?.value || "")
            .toLowerCase();

    const status =
        $("queueStatus")?.value ||
        "all";

    const list =
        jobs.filter(job => {

            const order =
                orders.find(
                    o => o.id === job.order_id
                );

            const shop =
                shops.find(
                    s => s.id === job.shop_id
                );

            const text = [
                order?.order_number,
                order?.order_id,
                order?.file_name,
                order?.front_file_name,
                order?.back_file_name,
                shop?.shop_name,
                shop?.shop_id
            ]
                .map(v =>
                    String(v || "")
                        .toLowerCase()
                )
                .join(" ");

            return (
                (!q || text.includes(q)) &&
                (
                    status === "all" ||
                    String(job.status || "")
                        .toUpperCase() ===
                    status
                )
            );
        });

    if (!list.length) {

        body.innerHTML = `
            <tr>
                <td colspan="9" class="empty">
                    No print jobs found.
                </td>
            </tr>
        `;

        return;
    }

    body.innerHTML =
        list.map(job => {

            const order =
                orders.find(
                    o => o.id === job.order_id
                );

            const shop =
                shops.find(
                    s => s.id === job.shop_id
                );

            const jobStatus =
                String(
                    job.status || ""
                ).toUpperCase();

            return `
            <tr>

                <td>
                    <strong>
                        ${esc(
                            order?.order_number ||
                            order?.order_id ||
                            job.order_id ||
                            "-"
                        )}
                    </strong>
                </td>

                <td>
                    ${esc(
                        shop?.shop_name ||
                        "-"
                    )}
                </td>

                <td>
                    ${esc(
                        order?.file_name ||
                        order?.front_file_name ||
                        "ID Card"
                    )}
                </td>

                <td>
                    ${order?.pages ?? "-"}
                </td>

                <td>
                    ${order?.copies ?? "-"}
                </td>

                <td>
                    ${badge(
                        order?.payment_status ||
                        "UNPAID"
                    )}
                </td>

                <td>
                    ${badge(jobStatus)}
                </td>

                <td>
                    ${date(
                        job.queued_at
                    )}
                </td>

                <td>

                    ${
                        ![
                            "PRINTING",
                            "COMPLETED",
                            "CANCELLED"
                        ].includes(jobStatus)

                        ?

                        `
                        <button
                            class="btn-sm primary-btn"
                            onclick="startJob('${esc(job.id)}')"
                        >
                            Start
                        </button>
                        `

                        : ""
                    }

                    ${
                        jobStatus === "PRINTING"

                        ?

                        `
                        <button
                            class="btn-sm primary-btn"
                            onclick="completeJob('${esc(job.id)}')"
                        >
                            Complete
                        </button>
                        `

                        : ""
                    }

                    ${
                        jobStatus === "FAILED"

                        ?

                        `
                        <button
                            class="btn-sm light-btn"
                            onclick="retryJob('${esc(job.id)}')"
                        >
                            Retry
                        </button>
                        `

                        : ""
                    }

                </td>

            </tr>
            `;
        }).join("");
}

/* =========================================================
   JOB ACTION
   ========================================================= */

async function setJobStatus(
    id,
    status
) {

    const job =
        jobs.find(
            item => item.id === id
        );

    if (!job) return;

    const patch = {
        status
    };

    if (status === "PRINTING") {

        patch.started_at =
            new Date().toISOString();
    }

    if (status === "COMPLETED") {

        patch.completed_at =
            new Date().toISOString();
    }

    if (status === "QUEUED") {

        patch.error_message = null;
    }

    const result =
        await db
            .from("print_jobs")
            .update(patch)
            .eq("id", id);

    if (result.error) {

        toast(
            "Print job update failed: " +
            result.error.message
        );

        return;
    }

    if (job.order_id) {

        const orderPatch = {
            print_status: status
        };

        if (status === "COMPLETED") {

            orderPatch.printed_at =
                new Date().toISOString();
        }

        if (status === "QUEUED") {

            orderPatch.error_message =
                null;
        }

        await db
            .from("orders")
            .update(orderPatch)
            .eq("id", job.order_id);
    }

    toast("Print job updated");

    await refresh();
}

window.startJob =
    id => setJobStatus(
        id,
        "PRINTING"
    );

window.completeJob =
    id => setJobStatus(
        id,
        "COMPLETED"
    );

window.retryJob =
    id => setJobStatus(
        id,
        "QUEUED"
    );

/* =========================================================
   AUDIT WRITE
   ========================================================= */

async function writeAudit(
    action,
    entityType,
    entityId,
    details = {},
    shopId = null
) {

    try {

        await db
            .from("audit_logs")
            .insert({
                actor_user_id:
                    adminUser?.id || null,

                shop_id:
                    shopId,

                action:
                    action,

                entity_type:
                    entityType,

                entity_id:
                    entityId,

                details:
                    details
            });

    } catch (error) {

        console.warn(
            "Audit log failed:",
            error
        );
    }
}

/* =========================================================
   PLATFORM SETTINGS UI
   ========================================================= */

function renderSettings() {

    if ($("platformName"))
        $("platformName").value =
            settingValue(
                "platform_name",
                "Auto Print"
            );

    if ($("supportPhone"))
        $("supportPhone").value =
            settingValue(
                "support_phone",
                ""
            );

    if ($("supportEmail"))
        $("supportEmail").value =
            settingValue(
                "support_email",
                ""
            );

    if ($("defaultBw"))
        $("defaultBw").value =
            settingValue(
                "default_print_price_bw",
                2
            );

    if ($("defaultColor"))
        $("defaultColor").value =
            settingValue(
                "default_print_price_color",
                10
            );

    const maintenance =
        Boolean(
            settingValue(
                "maintenance_mode",
                false
            )
        );

    if ($("maintenanceState"))
        $("maintenanceState").textContent =
            maintenance ? "ON" : "OFF";

    if ($("toggleMaintenance"))
        $("toggleMaintenance")
            .dataset.state =
                maintenance ? "1" : "0";
}

/* =========================================================
   EXPORT CSV
   ========================================================= */

function exportData(type) {

    const data =
        type === "shops"
            ? shops
            : orders;

    const headers =
        type === "shops"

            ?

            [
                "shop_id",
                "shop_name",
                "owner_name",
                "mobile",
                "email",
                "status",
                "plan",
                "created_at"
            ]

            :

            [
                "order_number",
                "shop_id",
                "customer_mobile",
                "amount",
                "payment_status",
                "print_status",
                "print_mode",
                "id_document_type",
                "print_type",
                "copies",
                "created_at"
            ];

    const rows =
        data.map(item =>
            type === "shops"

                ?

                [
                    item.shop_id,
                    item.shop_name,
                    item.owner_name,
                    item.mobile,
                    item.email,
                    item.status,
                    item.platform_plan,
                    item.created_at
                ]

                :

                [
                    item.order_number ||
                    item.order_id,

                    item.shop_id,

                    item.customer_mobile,

                    item.amount,

                    item.payment_status,

                    item.print_status,

                    item.print_mode,

                    item.id_document_type,

                    item.print_type,

                    item.copies,

                    item.created_at
                ]
        );

    const csv =
        [headers, ...rows]
            .map(row =>
                row
                    .map(value =>
                        `"${String(
                            value ?? ""
                        ).replaceAll(
                            '"',
                            '""'
                        )}"`
                    )
                    .join(",")
            )
            .join("\n");

    const blob =
        new Blob(
            [csv],
            {
                type:
                    "text/csv;charset=utf-8;"
            }
        );

    const url =
        URL.createObjectURL(blob);

    const a =
        document.createElement("a");

    a.href = url;

    a.download =
        `autoprint-${type}-${istDateKey()} .csv`.replace(" ", "");

    document.body.appendChild(a);

    a.click();

    a.remove();

    URL.revokeObjectURL(url);
}

/* =========================================================
   EVENTS
   ========================================================= */

function setupEvents() {

    $("refresh")?.addEventListener(
        "click",
        refresh
    );

    $("shopSearch")?.addEventListener(
        "input",
        renderShops
    );

    $("shopStatus")?.addEventListener(
        "change",
        renderShops
    );

    $("shopReset")?.addEventListener(
        "click",
        () => {

            $("shopSearch").value = "";

            $("shopStatus").value =
                "all";

            renderShops();
        }
    );

    $("adminOrderSearch")?.addEventListener(
        "input",
        renderOrders
    );

    $("adminOrderStatus")?.addEventListener(
        "change",
        renderOrders
    );

    $("adminPay")?.addEventListener(
        "change",
        renderOrders
    );

    $("customerSearch")?.addEventListener(
        "input",
        renderCustomers
    );

    $("customerReset")?.addEventListener(
        "click",
        () => {

            $("customerSearch").value =
                "";

            renderCustomers();
        }
    );

    $("customerRefresh")?.addEventListener(
        "click",
        refresh
    );

    $("queueSearch")?.addEventListener(
        "input",
        renderQueue
    );

    $("queueStatus")?.addEventListener(
        "change",
        renderQueue
    );

    $("queueRefresh")?.addEventListener(
        "click",
        refresh
    );

    $("exportShops")?.addEventListener(
        "click",
        () => exportData("shops")
    );

    $("exportOrders")?.addEventListener(
        "click",
        () => exportData("orders")
    );

    /* Maintenance */

    $("toggleMaintenance")?.addEventListener(
        "click",
        async () => {

            const button =
                $("toggleMaintenance");

            const current =
                button.dataset.state === "1";

            try {

                await saveSetting(
                    "maintenance_mode",
                    !current
                );

                toast(
                    "Maintenance mode updated"
                );

                renderSettings();

            } catch (error) {

                toast(
                    "Could not update maintenance mode: " +
                    error.message
                );
            }
        }
    );

    /* Platform settings */

    $("savePlatform")?.addEventListener(
        "click",
        async () => {

            try {

                await saveSetting(
                    "platform_name",
                    $("platformName").value.trim() ||
                    "Auto Print"
                );

                await saveSetting(
                    "support_phone",
                    $("supportPhone").value.trim()
                );

                await saveSetting(
                    "support_email",
                    $("supportEmail").value.trim()
                );

                await saveSetting(
                    "default_print_price_bw",
                    Number(
                        $("defaultBw").value || 2
                    )
                );

                await saveSetting(
                    "default_print_price_color",
                    Number(
                        $("defaultColor").value || 10
                    )
                );

                toast(
                    "Platform settings saved"
                );

            } catch (error) {

                console.error(error);

                toast(
                    "Settings save failed: " +
                    error.message
                );
            }
        }
    );


    /* Logout */

    $("logout")?.addEventListener(
        "click",
        async () => {

            const button = $("logout");
            if (button) {
                button.disabled = true;
                button.textContent = "Logging out...";
            }

            try {
                if (db?.auth) await db.auth.signOut();
            } catch (error) {
                console.warn("Super Admin logout signOut error:", error);
            } finally {
                window.location.replace("super-admin-login.html");
            }
        }
    );

    /* Navigation */

    document
        .querySelectorAll(".nav button")
        .forEach(button => {

            button.addEventListener(
                "click",
                () => {

                    document
                        .querySelectorAll(".nav button")
                        .forEach(item =>
                            item.classList.remove(
                                "active"
                            )
                        );

                    button.classList.add(
                        "active"
                    );

                    document
                        .querySelectorAll(".panel")
                        .forEach(panel =>
                            panel.classList.remove(
                                "active"
                            )
                        );

                    const panel =
                        $("panel-" +
                          button.dataset.tab);

                    if (panel) {
                        panel.classList.add(
                            "active"
                        );
                    }

                    if ($("title")) {

                        $("title").textContent =
                            button.textContent
                                .replace(
                                    /^\S+\s*/,
                                    ""
                                );
                    }

                    if ((button.dataset.tab === "support" || button.dataset.tab === "refunds") && window.loadSuperSupport) {
                        window.loadSuperSupport();
                    }
                }
            );
        });
}

/* =========================================================
   START
   ========================================================= */

document.addEventListener(
    "DOMContentLoaded",
    async () => {

        setupEvents();

        const ok =
            await requireSuperAdmin();

        if (!ok) return;

        /*
         * IMPORTANT:
         * panel-head is the actual class
         * used by your super-admin.html.
         */
        ensureAddShopUI();

        await refresh();

        /*
         * Auto refresh every 10 seconds.
         */
        setInterval(
            refresh,
            10000
        );
    }
);