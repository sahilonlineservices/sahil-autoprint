/* =========================================================
   AUTO PRINT - SHOP DASHBOARD
   FULL REPLACEMENT
   PART 1 / 2
   ========================================================= */

const db = window.supabaseClient || window.db;

const $ = id => document.getElementById(id);

let currentUser = null;
let shop = null;
let orders = [];
let jobs = [];
let wallet = null;
let shopCustomers = [];
let notes = [];
let devices = [];
let refreshTimer = null;


/* =========================================================
   BASIC HELPERS
   ========================================================= */

function money(v) {
  return "₹" + Number(v || 0).toFixed(2);
}


function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[c]));
}


function todayISO() {
  return new Date().toISOString().slice(0, 10);
}


function toast(msg) {

  const b = $("toast");

  if (!b) return;

  b.textContent = msg;
  b.style.display = "block";

  clearTimeout(window.__toast);

  window.__toast = setTimeout(() => {
    b.style.display = "none";
  }, 3500);
}


function badge(v) {

  const s = String(v || "UNKNOWN").toUpperCase();

  let c = "red";

  if ([
    "PAID",
    "COMPLETED",
    "READY",
    "ACTIVE",
    "ONLINE"
  ].includes(s)) {
    c = "green";
  }

  if ([
    "QUEUED",
    "PENDING",
    "UNPAID"
  ].includes(s)) {
    c = "yellow";
  }

  if ([
    "PRINTING"
  ].includes(s)) {
    c = "blue";
  }

  return `<span class="badge ${c}">${esc(s)}</span>`;
}


/* =========================================================
   SUPABASE SAFE QUERY
   ========================================================= */

async function safe(query, label = "Database request") {

  try {

    const r = await query;

    if (r.error) {

      console.error(label, r.error);

      return [];
    }

    return r.data || [];

  } catch (e) {

    console.error(label, e);

    return [];
  }
}


/* =========================================================
   SHOP
   ========================================================= */

async function getOwnedShop() {

  if (!currentUser) return null;

  try {

    const r = await db
      .from("shops")
      .select("*")
      .eq("owner_user_id", currentUser.id)
      .limit(1)
      .maybeSingle();

    if (r.error) {

      console.error("Shop lookup error:", r.error);

      toast(
        "Shop lookup failed: " +
        r.error.message
      );

      return null;
    }

    return r.data || null;

  } catch (e) {

    console.error(e);

    return null;
  }
}


/* =========================================================
   PRICE SETTINGS
   ========================================================= */

/*
   Default prices are only fallback values.

   Actual customer order amount must continue to be
   calculated by the backend/database.
*/

function getShopBwPrice() {

  const value = Number(shop?.print_price_bw);

  return Number.isFinite(value) && value > 0
    ? value
    : 2;
}


function getShopColorPrice() {

  const value = Number(shop?.print_price_color);

  return Number.isFinite(value) && value > 0
    ? value
    : 10;
}


/* ---------------------------------------------------------
   LOAD PRICE SETTINGS INTO UI
--------------------------------------------------------- */

function loadPriceSettings() {

  const bwInput = $("priceBwInput");
  const colorInput = $("priceColorInput");

  if (bwInput) {

    bwInput.value =
      getShopBwPrice().toFixed(2);
  }

  if (colorInput) {

    colorInput.value =
      getShopColorPrice().toFixed(2);
  }
}


/* ---------------------------------------------------------
   SAVE PRICE SETTINGS
--------------------------------------------------------- */

async function savePriceSettings() {

  if (!shop || !currentUser) {

    toast("Shop is not loaded.");

    return;
  }

  const bwInput = $("priceBwInput");
  const colorInput = $("priceColorInput");
  const saveButton = $("savePricesBtn");

  if (!bwInput || !colorInput) {

    toast("Price settings form not found.");

    return;
  }

  const bw = Number(bwInput.value);
  const color = Number(colorInput.value);


  /* -----------------------------
     VALIDATION
  ----------------------------- */

  if (
    !Number.isFinite(bw) ||
    bw <= 0 ||
    bw > 10000
  ) {

    toast(
      "Please enter a valid B&W price."
    );

    bwInput.focus();

    return;
  }


  if (
    !Number.isFinite(color) ||
    color <= 0 ||
    color > 10000
  ) {

    toast(
      "Please enter a valid Colour price."
    );

    colorInput.focus();

    return;
  }


  if (saveButton) {

    saveButton.disabled = true;
    saveButton.textContent =
      "Saving...";
  }


  try {

    /*
       IMPORTANT:
       Update only the currently loaded shop.

       The query also uses owner_user_id so the
       browser cannot intentionally update another
       owner's shop through this function.
    */

    const result = await db
      .from("shops")
      .update({
        print_price_bw: Number(bw.toFixed(2)),
        print_price_color: Number(color.toFixed(2))
      })
      .eq("id", shop.id)
      .eq("owner_user_id", currentUser.id)
      .select("*")
      .maybeSingle();


    if (result.error) {

      console.error(
        "PRICE SAVE ERROR:",
        result.error
      );

      toast(
        "Price save failed: " +
        result.error.message
      );

      return;
    }


    if (!result.data) {

      toast(
        "Price was not updated. Check shop permissions."
      );

      return;
    }


    /* Update local shop object */

    shop = result.data;


    /* Put saved values back into UI */

    loadPriceSettings();


    toast(
      "✅ Prices saved successfully."
    );


  } catch (e) {

    console.error(
      "PRICE SAVE EXCEPTION:",
      e
    );

    toast(
      "Price save failed: " +
      (e.message || "Unknown error")
    );

  } finally {

    if (saveButton) {

      saveButton.disabled = false;

      saveButton.textContent =
        "💾 Save Prices";
    }
  }
}


/* ---------------------------------------------------------
   PRICE SETTINGS EVENTS
--------------------------------------------------------- */

function setupPriceSettings() {

  const saveButton =
    $("savePricesBtn");

  if (saveButton) {

    saveButton.onclick =
      savePriceSettings;
  }

  loadPriceSettings();
}


/* =========================================================
   INIT
   ========================================================= */

async function init() {

  if (!db) {

    toast(
      "supabase-config.js is not loaded"
    );

    return;
  }


  try {

    const sessionResult =
      await db.auth.getSession();


    if (sessionResult.error) {

      toast(
        sessionResult.error.message
      );

      return;
    }


    currentUser =
      sessionResult.data.session?.user ||
      null;


    if (!currentUser) {

      location.href =
        "shop-login.html";

      return;
    }


    /* --------------------------------
       LOAD CURRENT OWNER SHOP
    -------------------------------- */

    shop =
      await getOwnedShop();


    if (!shop) {

      $("shopName").textContent =
        "Shop not found";

      $("shopId").textContent =
        "-";

      toast(
        "No Shop is linked to this login account."
      );

      return;
    }


    /* --------------------------------
       SHOP HEADER
    -------------------------------- */

    $("shopName").textContent =
      shop.shop_name || "Shop";

    $("shopId").textContent =
      shop.shop_id || "-";


    /* --------------------------------
       LOAD PRICE SETTINGS
    -------------------------------- */

    setupPriceSettings();


    /* --------------------------------
       LOAD DASHBOARD DATA
    -------------------------------- */

    await refreshData();


    /* --------------------------------
       NAVIGATION
    -------------------------------- */

    setupNavigation();


    /* --------------------------------
       QR
    -------------------------------- */

    setupQr();


    /* --------------------------------
       AUTO REFRESH
    -------------------------------- */

    if (refreshTimer) {

      clearInterval(refreshTimer);
    }


    refreshTimer =
      setInterval(
        refreshData,
        15000
      );


  } catch (e) {

    console.error(
      "INIT ERROR:",
      e
    );

    toast(
      "Dashboard error: " +
      e.message
    );
  }
}


/* =========================================================
   REFRESH ALL DATA
   ========================================================= */

async function refreshData() {

  if (!shop) return;


  const refreshButton =
    $("refreshBtn");


  if (refreshButton) {

    refreshButton.classList.add(
      "loading"
    );

    refreshButton.disabled = true;
  }


  try {

    /* --------------------------------
       ORDERS
    -------------------------------- */

    orders = await safe(

      db
        .from("orders")
        .select("*")
        .eq("shop_id", shop.id)
        .order(
          "created_at",
          {
            ascending: false
          }
        )
        .limit(100),

      "Orders"
    );


    /* --------------------------------
       PRINT JOBS
    -------------------------------- */

    jobs = await safe(

      db
        .from("print_jobs")
        .select("*")
        .eq("shop_id", shop.id)
        .order(
          "queued_at",
          {
            ascending: true
          }
        )
        .limit(100),

      "Print jobs"
    );


    /* --------------------------------
       AUTO PRINT DEVICES / PRINTER HEALTH
    -------------------------------- */

    devices = await safe(

      db
        .from("devices")
        .select("id,device_name,printer_name,printer_status,internet_status,last_heartbeat_at,last_error,queue_count,is_active,updated_at")
        .eq("shop_id", shop.id)
        .order("last_heartbeat_at", { ascending: false })
        .limit(10),

      "Devices"
    );


    /* --------------------------------
       CUSTOMERS
    -------------------------------- */

    shopCustomers = await safe(

      db
        .from("customers")
        .select("*")
        .eq("shop_id", shop.id)
        .order(
          "created_at",
          {
            ascending: false
          }
        )
        .limit(100),

      "Customers"
    );


    /* --------------------------------
       NOTIFICATIONS
    -------------------------------- */

    notes = await safe(

      db
        .from("notifications")
        .select("*")
        .eq("shop_id", shop.id)
        .order(
          "created_at",
          {
            ascending: false
          }
        )
        .limit(10),

      "Notifications"
    );


    /* --------------------------------
       WALLET
    -------------------------------- */

    const wallets = await safe(

      db
        .from("wallets")
        .select("*")
        .eq("shop_id", shop.id)
        .limit(1),

      "Wallet"
    );


    wallet =
      wallets[0] || null;


    /* --------------------------------
       RENDER
    -------------------------------- */

    render();


    /*
       Shop prices can be changed from
       another session, so refresh the
       inputs from the latest shop data
       whenever dashboard data is refreshed.
    */

    loadPriceSettings();


  } finally {

    if (refreshButton) {

      refreshButton.classList.remove(
        "loading"
      );

      refreshButton.disabled = false;
    }
  }
}


/* =========================================================
   RENDER DASHBOARD
   ========================================================= */

function render() {

  const today =
    todayISO();


  const todayOrders =
    orders.filter(o =>
      String(
        o.created_at || ""
      ).slice(0, 10) === today
    );


  const paidToday =
    todayOrders.filter(o =>
      String(
        o.payment_status || ""
      ).toUpperCase() === "PAID"
    );


  const sales =
    paidToday.reduce(
      (n, o) =>
        n + Number(
          o.amount || 0
        ),
      0
    );


  const prints =
    todayOrders.reduce(
      (n, o) =>
        n + Number(
          o.copies || 1
        ),
      0
    );


  const balance =
    Number(
      wallet?.balance ??
      wallet?.available_balance ??
      0
    );


  const pending =
    Number(
      wallet?.pending_settlement ??
      0
    );


  if ($("todayOrders")) {

    $("todayOrders").textContent =
      todayOrders.length;
  }


  if ($("todayPrints")) {

    $("todayPrints").textContent =
      prints;
  }


  if ($("todaySales")) {

    $("todaySales").textContent =
      money(sales);
  }


  if ($("walletBalance")) {

    $("walletBalance").textContent =
      money(balance);
  }


  if ($("pendingSettlement")) {

    $("pendingSettlement").textContent =
      money(pending);
  }


  if ($("walletBalance2")) {

    $("walletBalance2").textContent =
      money(balance);
  }


  if ($("pendingSettlement2")) {

    $("pendingSettlement2").textContent =
      money(pending);
  }


  renderRecent(todayOrders);

  renderAllOrders();

  renderQueue();

  renderCustomers();

  renderNotifications();


  /* --------------------------------
     DAILY REPORT
  -------------------------------- */

  if ($("reportBox")) {

    $("reportBox").innerHTML = `

      <div class="queue-item">

        <span>
          Orders
        </span>

        <strong>
          ${todayOrders.length}
        </strong>

      </div>


      <div class="queue-item">

        <span>
          Paid Sales
        </span>

        <strong>
          ${money(sales)}
        </strong>

      </div>


      <div class="queue-item">

        <span>
          Total Copies
        </span>

        <strong>
          ${prints}
        </strong>

      </div>

    `;
  }


  /* --------------------------------
     PRINTER STATUS
  -------------------------------- */

  // Never assume READY when no Auto Print Agent/device is reporting.
  // Windows can keep a printer name even when the physical printer is off.
  const activeDevice = (devices || []).find(d => d.is_active !== false);
  const heartbeatAge = activeDevice?.last_heartbeat_at
    ? Date.now() - new Date(activeDevice.last_heartbeat_at).getTime()
    : Infinity;
  const heartbeatFresh = Number.isFinite(heartbeatAge) && heartbeatAge <= 90000;
  const reportedPrinter = String(activeDevice?.printer_status || "").toUpperCase();
  const printerReady = heartbeatFresh && ["READY", "IDLE"].includes(reportedPrinter);
  const printerOffline = !heartbeatFresh || ["OFFLINE", "ERROR", "PAPER_OUT", "PAPER_JAM", "NOT_FOUND"].includes(reportedPrinter);

  if ($("printerBadge")) {
    $("printerBadge").textContent = printerReady ? "READY" : (reportedPrinter || "OFFLINE");
  }

  if ($("printerStatus")) {
    $("printerStatus").className = "pill " + (printerReady ? "" : "off");
    $("printerStatus").textContent = printerReady
      ? "● Printer Ready"
      : (reportedPrinter === "ERROR" ? "● Printer Error" : "● Printer Offline");
  }

  if ($("printerName")) {
    $("printerName").textContent =
      (heartbeatFresh && activeDevice?.printer_name)
        ? activeDevice.printer_name
        : "Printer not connected";
  }


/* =========================================================
   RECENT ORDERS
   ========================================================= */

function renderRecent(list) {

  const body =
    $("recentOrdersBody");


  if (!body) return;


  if (!list.length) {

    body.innerHTML = `

      <tr>

        <td
          colspan="8"
          class="empty"
        >
          No orders yet.
        </td>

      </tr>

    `;

    return;
  }


  body.innerHTML =
    list
      .slice(0, 8)
      .map(o => {

        const orderNumber =
          o.order_number ||
          o.order_id ||
          o.id?.slice(0, 8) ||
          "-";


        return `

          <tr>

            <td>
              <strong>
                ${esc(orderNumber)}
              </strong>
            </td>


            <td>
              ${esc(
                o.customer_mobile ||
                o.customer_name ||
                "-"
              )}
            </td>


            <td>
              ${esc(o.pages || 1)}
            </td>


            <td>
              ${esc(o.copies || 1)}
            </td>


            <td>
              ${money(o.amount)}
            </td>


            <td>
              ${badge(o.print_status)}
            </td>


            <td>

              ${
                o.created_at
                  ? new Date(
                      o.created_at
                    ).toLocaleTimeString(
                      "en-IN",
                      {
                        hour:
                          "2-digit",
                        minute:
                          "2-digit"
                      }
                    )
                  : "-"
              }

            </td>


            <td>
              ${receiptButton(o)}
            </td>

          </tr>

        `;

      })
      .join("");
}


/* =========================================================
   ALL ORDERS
   ========================================================= */

function renderAllOrders() {

  const body =
    $("allOrdersBody");


  if (!body) return;


  if (!orders.length) {

    body.innerHTML = `

      <tr>

        <td
          colspan="8"
          class="empty"
        >
          No orders found.
        </td>

      </tr>

    `;

    return;
  }


  body.innerHTML =
    orders
      .map(o => {

        const orderNumber =
          o.order_number ||
          o.order_id ||
          o.id ||
          "-";


        return `

          <tr>

            <td>
              <strong>
                ${esc(orderNumber)}
              </strong>
            </td>


            <td>
              ${esc(
                o.customer_mobile ||
                o.customer_name ||
                "-"
              )}
            </td>


            <td>
              ${esc(o.pages || 1)}
            </td>


            <td>
              ${esc(o.copies || 1)}
            </td>


            <td>
              ${money(o.amount)}
            </td>


            <td>
              ${badge(o.payment_status)}
            </td>


            <td>
              ${badge(o.print_status)}
            </td>


            <td>
              ${receiptButton(o)}
            </td>

          </tr>

        `;

      })
      .join("");
}


/* =========================================================
   RECEIPT
   ========================================================= */

function receiptButton(o) {

  const n =
    o.order_number ||
    o.order_id ||
    o.id ||
    "";


  if (!n) return "-";


  const url =
    `receipt.html?order=${encodeURIComponent(n)}`;


  /*
     IMPORTANT:
     Shop Admin must NOT manually mark
     payment as PAID.

     Payment must be verified by the
     Razorpay server-side verification
     flow.
  */

  return `

    <a
      href="${url}"
      target="_blank"
    >
      Receipt
    </a>

  `;
}


/* =========================================================
   PRINT QUEUE
   ========================================================= */

function renderQueue() {

  const queued =
    jobs.filter(j =>
      ![
        "COMPLETED",
        "CANCELLED"
      ].includes(
        String(
          j.status || ""
        ).toUpperCase()
      )
    );


  const box =
    $("queueBox");


  if (box) {

    box.innerHTML =
      queued
        .slice(0, 6)
        .map(j => {

          const order =
            orders.find(o =>
              String(o.id) ===
              String(j.order_id)
            );


          const fileName =
            j.file_name ||
            order?.file_name ||
            order?.filename ||
            "Print Job";


          return `

            <div class="queue-item">

              <div>

                <strong>
                  ${esc(fileName)}
                </strong>

                <div class="small">

                  Pages:
                  ${esc(
                    j.pages ||
                    order?.pages ||
                    1
                  )}

                  ·

                  Copies:
                  ${esc(
                    j.copies ||
                    order?.copies ||
                    1
                  )}

                </div>

              </div>


              <div>
                ${badge(j.status)}
              </div>

            </div>

          `;

        })
        .join("") ||
      `<div class="empty">
        Print queue is empty.
      </div>`;
  }


  const body =
    $("allQueueBody");


  if (!body) return;


  body.innerHTML =
    jobs
      .map(j => {

        return `

          <tr>

            <td>
              ${esc(
                j.id
                  ? j.id.slice(0, 8)
                  : "-"
              )}
            </td>


            <td>
              ${esc(
                j.order_id || "-"
              )}
            </td>


            <td>
              ${esc(
                j.pages || 1
              )}
            </td>


            <td>
              ${esc(
                j.copies || 1
              )}
            </td>


            <td>
              ${badge(j.status)}
            </td>


            <td>
              ${queueActions(j)}
            </td>

          </tr>

        `;

      })
      .join("") ||

    `

      <tr>

        <td
          colspan="6"
          class="empty"
        >
          No print jobs found.
        </td>

      </tr>

    `;
}


/* =========================================================
   QUEUE ACTIONS
   ========================================================= */

function queueActions(j) {

  const s =
    String(
      j.status || "UNKNOWN"
    ).toUpperCase();


  if (s === "FAILED") {

    return `
      <button
        class="primary"
        onclick="retryPrintJob('${esc(j.id)}')"
      >
        Retry
      </button>
    `;
  }


  if (s === "QUEUED") {

    return `
      <span class="badge yellow">
        AUTO QUEUE
      </span>
    `;
  }


  if (s === "PRINTING") {

    return `
      <span class="badge blue">
        AUTO PRINTING
      </span>
    `;
  }


  if (s === "COMPLETED") {

    return `
      <span class="badge green">
        DONE
      </span>
    `;
  }


  return "-";
}


/* =========================================================
   FIND DOCUMENT URL
   ========================================================= */

function getDocumentUrl(job) {

  if (!job) return null;


  const order =
    orders.find(o =>
      String(o.id) ===
      String(job.order_id)
    );


  const possible = [

    job.file_url,

    job.document_url,

    job.pdf_url,

    job.file_path,

    job.front_file_path,

    job.back_file_path,

    job.document_path,

    job.storage_path,

    job.url,

    order?.file_url,

    order?.document_url,

    order?.pdf_url,

    order?.file_path,

    order?.front_file_path,

    order?.back_file_path,

    order?.document_path,

    order?.storage_path,

    order?.fileUrl

  ];


  for (const value of possible) {

    if (
      value &&
      typeof value === "string" &&
      value.trim()
    ) {

      return value.trim();
    }
  }


  return null;
}


/* =========================================================
   OPEN DOCUMENT FOR PRINT
   ========================================================= */

async function openDocumentForPrint(job) {

  const url =
    getDocumentUrl(job);


  if (!url) {

    toast(
      "Document file URL/path is missing. " +
      "This print job cannot be sent to printer."
    );


    console.error(
      "PRINT ERROR: No document URL/path found.",
      job
    );


    return false;
  }


  let finalUrl =
    url;


  /*
     If already HTTP/HTTPS, use directly.
  */

  if (
    !/^https?:\/\//i.test(url) &&
    !url.startsWith("blob:") &&
    !url.startsWith("data:")
  ) {

    const bucket =
      job.bucket ||
      job.storage_bucket ||
      job.bucket_name ||
      "documents";


    try {

      const publicResult =
        db.storage
          .from(bucket)
          .getPublicUrl(url);


      if (
        publicResult?.data?.publicUrl
      ) {

        finalUrl =
          publicResult.data.publicUrl;
      }


    } catch (e) {

      console.warn(
        "Storage public URL failed:",
        e
      );
    }
  }


  console.log(
    "AUTO PRINT DOCUMENT:",
    finalUrl
  );


  const printWindow =
    window.open(
      "",
      "_blank",
      "width=900,height=700"
    );


  if (!printWindow) {

    toast(
      "Popup blocked. Please allow popups for this website."
    );


    return false;
  }


  printWindow.document.write(`

    <!DOCTYPE html>

    <html>

    <head>

      <title>
        Auto Print
      </title>

      <style>

        html,
        body {
          margin:0;
          padding:0;
          width:100%;
          height:100%;
          background:#fff;
        }

        iframe {
          width:100%;
          height:100%;
          border:0;
        }

        .loading {
          font-family:Arial;
          text-align:center;
          padding-top:40px;
        }

      </style>

    </head>

    <body>

      <div class="loading">
        Loading document for printing...
      </div>

      <iframe
        id="printFrame"
        src="${esc(finalUrl)}"
      ></iframe>

    </body>

    </html>

  `);


  printWindow.document.close();


  return new Promise(resolve => {

    const frame =
      printWindow.document
        .getElementById(
          "printFrame"
        );


    let printed = false;


    const doPrint = () => {

      if (printed) return;

      printed = true;


      try {

        frame.contentWindow
          .focus();

        frame.contentWindow
          .print();

      } catch (e) {

        console.error(
          "Browser print failed:",
          e
        );


        try {

          printWindow.print();

        } catch (_) {}
      }


      resolve(true);
    };


    frame.onload = () => {

      setTimeout(
        doPrint,
        1000
      );
    };


    setTimeout(
      doPrint,
      5000
    );

  });
}


/* =========================================================
   AUTOMATIC PRINTING
   ========================================================= */

// Shop Admin cannot manually mark payment paid
// or start a print.
//
// The authorized Windows Auto Print Agent claims
// and prints verified orders.

window.retryPrintJob =
  async function(id) {

    if (!shop) return;


    const r =
      await db.rpc(
        "shop_retry_print_job",
        {
          p_job_id: id
        }
      );


    if (r.error) {

      toast(
        "Retry failed: " +
        r.error.message
      );

      return;
    }


    toast(
      "Job returned to the automatic print queue."
    );


    await refreshData();
  };

  /* =========================================================
   CUSTOMERS
   ========================================================= */

function renderCustomers() {

  const body = $("customersBody");

  if (!body) return;


  if (!shopCustomers.length) {

    body.innerHTML = `
      <tr>
        <td colspan="4" class="empty">
          No customers found.
        </td>
      </tr>
    `;

    return;
  }


  body.innerHTML =
    shopCustomers
      .map(c => `

        <tr>

          <td>
            ${esc(c.name || "-")}
          </td>

          <td>
            ${esc(c.mobile || "-")}
          </td>

          <td>
            ${esc(c.email || "-")}
          </td>

          <td>
            ${esc(c.orders_count || "-")}
          </td>

        </tr>

      `)
      .join("");
}


/* =========================================================
   NOTIFICATIONS
   ========================================================= */

function renderNotifications() {

  const box =
    $("notificationsBox");

  if (!box) return;


  box.innerHTML =
    notes
      .map(n => `

        <div class="queue-item">

          <div>

            <strong>
              ${esc(
                n.title ||
                n.message ||
                "Notification"
              )}
            </strong>


            <div class="small">

              ${
                n.created_at
                  ? new Date(
                      n.created_at
                    ).toLocaleString(
                      "en-IN"
                    )
                  : ""
              }

            </div>

          </div>

        </div>

      `)
      .join("") ||

    `

      <div class="empty">
        No notifications.
      </div>

    `;
}


/* =========================================================
   SHOP QR
   ========================================================= */

function getCustomerQrUrl() {

  if (!shop?.shop_id) {

    return location.href;
  }


  const base =
    new URL(
      "index.html",
      location.href
    );


  const qrSlug = String(
    shop?.qr_slug ||
    shop?.shop_id ||
    ""
  ).trim();

  base.searchParams.set(
    "qr_slug",
    qrSlug
  );


  return base.href;
}


/* ---------------------------------------------------------
   QR RENDER
--------------------------------------------------------- */

function qrRender(
  targetId,
  size = 230
) {

  const el =
    $(targetId);


  if (!el || !shop) return;


  el.innerHTML = "";


  if (
    typeof QRCode === "undefined"
  ) {

    el.innerHTML = `

      <span class="muted">
        QR library could not load.
      </span>

    `;

    return;
  }


  new QRCode(el, {

    text:
      getCustomerQrUrl(),

    width:
      size,

    height:
      size,

    colorDark:
      "#000000",

    colorLight:
      "#ffffff",

    correctLevel:
      QRCode.CorrectLevel.H

  });
}


/* ---------------------------------------------------------
   SETUP QR
--------------------------------------------------------- */

function setupQr() {

  if (!shop) return;


  if ($("qrShopName")) {

    $("qrShopName").textContent =
      shop.shop_name ||
      "Shop";
  }


  if ($("qrShopId")) {

    $("qrShopId").textContent =
      shop.shop_id ||
      "-";
  }


  if ($("qrLink")) {

    $("qrLink").value =
      getCustomerQrUrl();
  }


  qrRender(
    "qrCanvas",
    230
  );


  /* --------------------------------
     PREVIEW
  -------------------------------- */

  if ($("previewQrBtn")) {

    $("previewQrBtn").onclick =
      () => {

        $("modalQrShopName")
          .textContent =
            shop.shop_name ||
            "My Shop QR";


        $("modalQrShopId")
          .textContent =
            "Shop ID: " +
            (
              shop.shop_id ||
              "-"
            );


        qrRender(
          "modalQrCanvas",
          280
        );


        $("qrModal")
          .classList
          .add("show");


        $("qrModal")
          .setAttribute(
            "aria-hidden",
            "false"
          );
      };
  }


  /* --------------------------------
     CLOSE QR MODAL
  -------------------------------- */

  if ($("qrModalClose")) {

    $("qrModalClose").onclick =
      closeQrModal;
  }


  if ($("qrModal")) {

    $("qrModal").onclick =
      e => {

        if (
          e.target ===
          $("qrModal")
        ) {

          closeQrModal();
        }
      };
  }


  /* --------------------------------
     DOWNLOAD QR
  -------------------------------- */

  if ($("downloadQrBtn")) {

    $("downloadQrBtn").onclick =
      downloadShopQr;
  }


  /* --------------------------------
     PRINT QR
  -------------------------------- */

  if ($("printQrBtn")) {

    $("printQrBtn").onclick =
      printQrOnly;
  }


  /* --------------------------------
     A4 POSTER
  -------------------------------- */

  if ($("posterQrBtn")) {

    $("posterQrBtn").onclick =
      downloadA4Poster;
  }


  /* --------------------------------
     COPY QR LINK
  -------------------------------- */

  if ($("copyQrLinkBtn")) {

    $("copyQrLinkBtn").onclick =
      async () => {

        try {

          await navigator.clipboard
            .writeText(
              getCustomerQrUrl()
            );


          toast(
            "QR link copied"
          );


        } catch (e) {

          $("qrLink").select();

          document.execCommand(
            "copy"
          );


          toast(
            "QR link copied"
          );
        }
      };
  }
}


/* =========================================================
   CLOSE QR MODAL
   ========================================================= */

function closeQrModal() {

  if (!$("qrModal")) return;


  $("qrModal")
    .classList
    .remove("show");


  $("qrModal")
    .setAttribute(
      "aria-hidden",
      "true"
    );
}


/* =========================================================
   GET QR IMAGE
   ========================================================= */

function getQrImageFrom(
  containerId
) {

  const box =
    $(containerId);


  if (!box) return null;


  return (
    box.querySelector(
      "canvas"
    ) ||
    box.querySelector(
      "img"
    )
  );
}


/* =========================================================
   DOWNLOAD SHOP QR
   ========================================================= */

function downloadShopQr() {

  const img =
    getQrImageFrom(
      "qrCanvas"
    );


  if (!img) {

    toast(
      "QR is not ready yet."
    );

    return;
  }


  const source =
    img.tagName.toLowerCase() ===
    "canvas"

      ? img.toDataURL(
          "image/png"
        )

      : img.src;


  const a =
    document.createElement(
      "a"
    );


  a.href =
    source;


  a.download =
    `${
      (
        shop.shop_id ||
        "shop"
      ).replace(
        /[^a-z0-9_-]/gi,
        "_"
      )
    }-QR.png`;


  document.body.appendChild(a);

  a.click();

  a.remove();


  toast(
    "QR downloaded"
  );
}


/* =========================================================
   PRINT QR ONLY
   ========================================================= */

function printQrOnly() {

  const source =
    getQrImageFrom(
      "qrCanvas"
    );


  if (!source) {

    toast(
      "QR is not ready yet."
    );

    return;
  }


  const src =
    source.tagName.toLowerCase() ===
    "canvas"

      ? source.toDataURL(
          "image/png"
        )

      : source.src;


  const w =
    window.open(
      "",
      "_blank",
      "width=700,height=800"
    );


  if (!w) {

    toast(
      "Please allow pop-ups to print QR."
    );

    return;
  }


  w.document.write(`

    <!doctype html>

    <html>

    <head>

      <title>
        Shop QR
      </title>

      <style>

        body {
          font-family:Arial;
          text-align:center;
          padding:45px;
        }

        h1 {
          margin-bottom:8px;
        }

        img {
          width:360px;
          height:360px;
          margin:30px auto;
          display:block;
        }

        p {
          color:#555;
        }

      </style>

    </head>

    <body>

      <h1>
        ${esc(
          shop.shop_name ||
          "Auto Print"
        )}
      </h1>


      <p>
        Shop ID:
        ${esc(
          shop.shop_id ||
          "-"
        )}
      </p>


      <img
        src="${src}"
      >


      <p>
        Scan to send your document
        for printing
      </p>

    </body>

    </html>

  `);


  w.document.close();

  w.focus();


  setTimeout(() => {

    w.print();

    w.close();

  }, 350);
}


/* =========================================================
   DOWNLOAD A4 POSTER
   ========================================================= */

function downloadA4Poster() {

  const qr =
    getQrImageFrom(
      "qrCanvas"
    );


  if (!qr) {

    toast(
      "QR is not ready yet."
    );

    return;
  }


  const src =
    qr.tagName.toLowerCase() ===
    "canvas"

      ? qr.toDataURL(
          "image/png"
        )

      : qr.src;


  const w =
    window.open(
      "",
      "_blank",
      "width=800,height=1100"
    );


  if (!w) {

    toast(
      "Please allow pop-ups for the A4 poster."
    );

    return;
  }


  w.document.write(`

    <!doctype html>

    <html>

    <head>

      <title>
        Auto Print A4 Poster
      </title>

      <style>

        @page {
          size:A4;
          margin:0;
        }

        body {
          font-family:Arial;
          text-align:center;
          margin:0;
        }

        .page {
          width:210mm;
          height:297mm;
          display:flex;
          align-items:center;
          justify-content:center;
        }

        .inner {
          width:180mm;
          padding:15mm;
          border:3px solid #162137;
          border-radius:18px;
        }

        .inner h1 {
          font-size:42px;
          margin:0 0 10px;
        }

        .inner h2 {
          font-size:28px;
          margin:8px 0;
        }

        .inner p {
          font-size:19px;
          color:#333;
        }

        .inner img {
          width:110mm;
          height:110mm;
          margin:18mm auto;
          display:block;
        }

      </style>

    </head>

    <body>

      <div class="page">

        <div class="inner">

          <h1>
            AUTO PRINT
          </h1>


          <h2>
            ${esc(
              shop.shop_name ||
              "Shop"
            )}
          </h2>


          <p>
            Scan the QR code to send
            your document for printing
          </p>


          <img
            src="${src}"
          >


          <h2>
            Shop ID:
            ${esc(
              shop.shop_id ||
              "-"
            )}
          </h2>


          <p>
            Upload • Select • Pay • Print
          </p>

        </div>

      </div>

    </body>

    </html>

  `);


  w.document.close();

  w.focus();


  setTimeout(() => {

    w.print();

    w.close();

  }, 350);
}


/* =========================================================
   EXTRA SHOP MODULES
   ========================================================= */

async function loadNotifications() {
  if (!shop?.id || !db) return;
  const rows = await safe(
    db.from("notifications").select("id,title,message,type,read_at,created_at")
      .eq("shop_id", shop.id).order("created_at", {ascending:false}).limit(100),
    "Load notifications"
  );
  const body = $("notificationsBody");
  if (!body) return;
  body.innerHTML = rows.length ? rows.map(n => `<tr><td>${esc(new Date(n.created_at).toLocaleString())}</td><td>${esc(n.title)}</td><td>${esc(n.message)}</td><td>${badge(n.type)}</td><td>${n.read_at ? "Read" : "Unread"}</td><td>${n.read_at ? "—" : `<button class="btn-sm primary-btn" onclick="window.markShopNotification('${n.id}')">Mark read</button>`}</td></tr>`).join("") : `<tr><td colspan="6" class="empty">No notifications.</td></tr>`;
}

window.markShopNotification = async function(id) {
  if (!db || !shop?.id) return;
  const r = await db.from("notifications").update({read_at:new Date().toISOString()}).eq("id",id).eq("shop_id",shop.id);
  if (r.error) return toast("Could not mark notification.");
  loadNotifications();
};

async function loadLicensePanel() {
  const box=$("licenseBox");
  if (!box || !shop?.id) return;
  const rows = await safe(db.from("licenses").select("license_key,status,plan,expires_at,device_limit,created_at").eq("shop_id",shop.id).order("created_at",{ascending:false}).limit(1),"Load license");
  const l=rows[0];
  if(!l){ box.innerHTML='<strong>No license record found.</strong><p class="muted">The Super Admin can issue or activate a license for this shop.</p>'; return; }
  box.innerHTML=`<div class="grid-3"><div><span class="muted">Status</span><div>${badge(l.status)}</div></div><div><span class="muted">Plan</span><div><strong>${esc(l.plan||'—')}</strong></div></div><div><span class="muted">Expires</span><div><strong>${l.expires_at?esc(new Date(l.expires_at).toLocaleString()):'—'}</strong></div></div></div><p style="margin-top:16px"><span class="muted">License Key</span><br><code>${esc(l.license_key||'—')}</code></p><p class="muted">Authorized device limit: ${esc(l.device_limit??1)}</p>`;
}

async function loadSubscriptionPanel() {
  if (!shop?.id) return;
  const box=$("subscriptionBox");
  if(box){
    box.innerHTML=`<div class="grid-3"><div><span class="muted">Account</span><strong>${esc(shop.account_type||'commercial')}</strong></div><div><span class="muted">Status</span>${badge(shop.status||'unknown')}</div><div><span class="muted">AutoPay</span>${badge(shop.autopay_status||'not_configured')}</div></div><div class="grid-3" style="margin-top:14px"><div><span class="muted">Trial Ends</span><strong>${shop.trial_ends_at?esc(new Date(shop.trial_ends_at).toLocaleString()):'—'}</strong></div><div><span class="muted">Next Billing</span><strong>${shop.next_billing_at?esc(new Date(shop.next_billing_at).toLocaleString()):'—'}</strong></div><div><span class="muted">Renewal Required</span><strong>${shop.renewal_required?'Yes':'No'}</strong></div></div>`;
  }
  const rows=await safe(db.from("subscription_events").select("event_type,plan,amount,reference,created_at").eq("shop_id",shop.id).order("created_at",{ascending:false}).limit(100),"Load subscription events");
  const body=$("subscriptionEventsBody"); if(!body)return;
  body.innerHTML=rows.length?rows.map(e=>`<tr><td>${esc(new Date(e.created_at).toLocaleString())}</td><td>${esc(e.event_type)}</td><td>${esc(e.plan||'—')}</td><td>${money(e.amount)}</td><td>${esc(e.reference||'—')}</td></tr>`).join(''):`<tr><td colspan="5" class="empty">No subscription events.</td></tr>`;
}

async function loadAuditPanel() {
  if(!shop?.id) return;
  const rows=await safe(db.from("audit_logs").select("action,entity_type,entity_id,details,created_at").eq("shop_id",shop.id).order("created_at",{ascending:false}).limit(200),"Load audit logs");
  const body=$("shopAuditBody"); if(!body)return;
  body.innerHTML=rows.length?rows.map(a=>`<tr><td>${esc(new Date(a.created_at).toLocaleString())}</td><td>${esc(a.action)}</td><td>${esc(a.entity_type||'—')} ${esc(a.entity_id||'')}</td><td><code>${esc(JSON.stringify(a.details||{}))}</code></td></tr>`).join(''):`<tr><td colspan="4" class="empty">No audit entries.</td></tr>`;
}

function downloadCSV(filename, rows) {
  if(!rows.length){ toast('No data to export.'); return; }
  const keys=[...new Set(rows.flatMap(r=>Object.keys(r)))];
  const q=v=>`"${String(v??'').replaceAll('"','""')}"`;
  const csv=[keys.map(q).join(','),...rows.map(r=>keys.map(k=>q(typeof r[k]==='object'?JSON.stringify(r[k]):r[k])).join(','))].join('\n');
  const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})); a.download=filename; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}

async function exportShopData(kind){
  if(!shop?.id)return;
  let table='orders', filename='shop-orders.csv';
  if(kind==='customers'){table='customers';filename='shop-customers.csv';}
  if(kind==='wallet'){table='wallet_transactions';filename='shop-wallet-ledger.csv';}
  const rows=await safe(db.from(table).select("*").eq("shop_id",shop.id).order("created_at",{ascending:false}).limit(5000),`Export ${table}`);
  downloadCSV(filename,rows);
}

/* =========================================================
   NAVIGATION
   ========================================================= */

function setupNavigation() {

  document
    .querySelectorAll(
      ".nav button"
    )
    .forEach(btn => {

      btn.addEventListener(
        "click",
        () => {


          /* -----------------------------
             REMOVE ACTIVE
          ----------------------------- */

          document
            .querySelectorAll(
              ".nav button"
            )
            .forEach(x =>
              x.classList.remove(
                "active"
              )
            );


          btn.classList.add(
            "active"
          );


          const tab =
            btn.dataset.tab;


          /* -----------------------------
             HIDE ALL SECTIONS
          ----------------------------- */

          document
            .querySelectorAll(
              "main section"
            )
            .forEach(s =>
              s.style.display =
                "none"
            );


          /* -----------------------------
             SHOW SELECTED SECTION
          ----------------------------- */

          const el =
            $(tab + "View");


          if (el) {

            el.style.display =
              "";
          }


          /* -----------------------------
             PAGE TITLE
          ----------------------------- */

          if ($("pageTitle")) {

            $("pageTitle")
              .textContent =
                btn.textContent
                  .replace(
                    /^[^\w]+/,
                    ""
                  )
                  .trim();
          }


          if (tab === "notifications") loadNotifications();
          if (tab === "license") loadLicensePanel();
          if (tab === "subscriptions") loadSubscriptionPanel();
          if (tab === "audit") loadAuditPanel();

          /* -----------------------------
             PRICE SETTINGS
          ----------------------------- */

          if (
            tab === "prices"
          ) {

            loadPriceSettings();
          }


          /* -----------------------------
             QR
          ----------------------------- */

          if (
            tab === "qr"
          ) {

            setupQr();
          }

          if (tab === "payout" && window.loadShopPayout) window.loadShopPayout();

          if (tab === "support" || tab === "refunds") {
            if (window.loadShopSupport && shop?.id) window.loadShopSupport(shop.id);
          }

          if (tab === "shophelp") {
            if (window.loadShopHelp && shop?.id) window.loadShopHelp(shop.id);
          }

        }
      );

    });


  /* --------------------------------
     REFRESH BUTTON
  -------------------------------- */

  if ($("refreshBtn")) {

    $("refreshBtn").onclick =
      refreshData;
  }


  /* --------------------------------
     LOGOUT
  -------------------------------- */

  if ($("logoutBtn")) {

    $("logoutBtn").onclick =
      async () => {

        const btn = $("logoutBtn");
        if (btn) {
          btn.disabled = true;
          btn.textContent = "Logging out...";
        }

        try {
          if (db?.auth) await db.auth.signOut();
        } catch (error) {
          console.warn("Shop logout signOut error:", error);
        } finally {
          localStorage.removeItem("autoprint_shop");
          window.location.replace("shop-login.html");
        }
      };
  }
}


/* =========================================================
   EXTRA MODULE EVENTS
   ========================================================= */
document.addEventListener("DOMContentLoaded",()=>{
  $("refreshNotifications")?.addEventListener("click",loadNotifications);
  $("exportShopOrders")?.addEventListener("click",()=>exportShopData("orders"));
  $("exportShopCustomers")?.addEventListener("click",()=>exportShopData("customers"));
  $("exportShopWallet")?.addEventListener("click",()=>exportShopData("wallet"));
});

/* =========================================================
   START APPLICATION
   ========================================================= */

document.addEventListener(
  "DOMContentLoaded",
  init
);

// Auto Print Agent download
document.addEventListener('click', function (e) {
  const link = e.target.closest('#autoPrintAgentLink');
  if (link) {
    e.preventDefault();
    const section = document.getElementById('auto-print-agent');
    if (section) section.scrollIntoView({behavior:'smooth', block:'start'});
  }
});
