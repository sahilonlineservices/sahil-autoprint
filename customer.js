/* =========================================================
   AUTO PRINT - CUSTOMER.JS
   FINAL WORKING CUSTOMER ORDER FLOW
   ========================================================= */

(function () {
    "use strict";

    /* ==============================
       SUPABASE
    ============================== */

    const SUPABASE_URL =
        "https://vwxtjtixojubxlmshies.supabase.co";

    const SUPABASE_KEY =
        "sb_publishable_kvAGmQmXhnYWf6li1Mn8lw_sPAN4Z2u";

    const BUCKET =
        "print-files";

    // Prices are loaded from the selected shop's Admin Price Settings.
    // Do NOT hard-code customer prices here.
    let BW_PRICE = null;
    let COLOR_PRICE = null;
    const MAX_SIZE = 50 * 1024 * 1024;

    let db = null;

    if (window.supabase) {
        db = window.supabase.createClient(
            SUPABASE_URL,
            SUPABASE_KEY
        );
    }

    /* ==============================
       STATE
    ============================== */

    const state = {
        mode: "document",

        documentFile: null,
        frontFile: null,
        backFile: null,

        pages: 0,
        selectedPages: [],
        copies: 1,

        printType: "bw",
        orientation: "portrait",

        mobile: "",

        shopId: "",
        shopName: "",
        shopUuid: "",
        qrSlug: "",

        amount: 0,

        submitting: false
    };

    /* ==============================
       HELPERS
    ============================== */

    function $(id) {
        return document.getElementById(id);
    }

    function money(value) {
        return "₹" + Number(value || 0).toFixed(2);
    }

    function setText(id, value) {
        const el = $(id);

        if (el) {
            el.textContent = String(value);
        }
    }

    function error(message) {
        const el = $("error");

        if (!el) {
            alert(message);
            return;
        }

        el.textContent =
            message || "Something went wrong.";

        el.style.display = "block";
    }

    function clearError() {
        const el = $("error");

        if (!el) return;

        el.textContent = "";
        el.style.display = "none";
    }

    function extension(file) {
        return String(file?.name || "")
            .split(".")
            .pop()
            .toLowerCase();
    }

    function isPDF(file) {
        return !!file &&
            (
                file.type === "application/pdf" ||
                extension(file) === "pdf"
            );
    }

    function isImage(file) {
        return !!file &&
            [
                "jpg",
                "jpeg",
                "png"
            ].includes(extension(file));
    }

    function validDocument(file) {

        if (!file) {
            error("Please choose a file.");
            return false;
        }

        if (file.size > MAX_SIZE) {
            error("Maximum file size is 50 MB.");
            return false;
        }

        if (
            !isPDF(file) &&
            !isImage(file)
        ) {
            error(
                "Only PDF, JPG, JPEG or PNG files are allowed."
            );

            return false;
        }

        return true;
    }

    function validIdFile(file, side) {

        if (!file) {
            error(
                "Please upload ID Card " +
                side +
                "."
            );

            return false;
        }

        if (file.size > MAX_SIZE) {
            error(
                side +
                " file must be 50 MB or smaller."
            );

            return false;
        }

        if (!isImage(file)) {
            error(
                side +
                " के लिए JPG, JPEG या PNG file चुनें."
            );

            return false;
        }

        return true;
    }

    /* ==============================
       SHOP QR
    ============================== */

    function getShopCode() {

        const params =
            new URLSearchParams(
                window.location.search
            );

        return (
            params.get("shop_id") ||
            params.get("shopId") ||
            params.get("shop") ||
            params.get("qr_slug") ||
            params.get("slug") ||
            ""
        ).trim();
    }

    /* ==============================
       SHOP LOAD
    ============================== */

    async function loadShop() {

        state.qrSlug =
            getShopCode();

        console.log(
            "AUTO PRINT SHOP QR:",
            state.qrSlug
        );

        if (!db) {

            setText(
                "shopName",
                "Connection Error"
            );

            setText(
                "shopId",
                "Shop ID: —"
            );

            error(
                "Supabase library load नहीं हुई. Page refresh करें."
            );

            return false;
        }

        if (!state.qrSlug) {

            setText(
                "shopName",
                "Shop not selected"
            );

            setText(
                "shopId",
                "Shop ID: —"
            );

            error(
                "Shop ID नहीं मिला. Shop QR से page खोलें."
            );

            return false;
        }

        try {

            setText(
                "shopName",
                "Loading Shop..."
            );

            const result =
                await db.rpc(
                    "get_public_shop",
                    {
                        p_qr_slug:
                            state.qrSlug
                    }
                );

            console.log(
                "GET SHOP RESULT:",
                result
            );

            if (result.error) {
                throw result.error;
            }

            let shop =
                Array.isArray(result.data)
                    ? result.data[0]
                    : result.data;

            if (!shop) {

                setText(
                    "shopName",
                    "Shop Not Found"
                );

                setText(
                    "shopId",
                    "Shop ID: " +
                    state.qrSlug
                );

                error(
                    "Shop नहीं मिला. Shop QR और Shop ID check करें."
                );

                return false;
            }

            /*
             * SHOP-SPECIFIC PRICES
             * Loaded from Shop Admin Price Settings.
             * create_public_order() remains the final server-side
             * authority for the actual order amount.
             */
            const savedBwPrice = Number(shop.print_price_bw);
            const savedColorPrice = Number(shop.print_price_color);

            if (!Number.isFinite(savedBwPrice) || savedBwPrice <= 0) {
                throw new Error("Shop B&W price is not configured.");
            }

            if (!Number.isFinite(savedColorPrice) || savedColorPrice <= 0) {
                throw new Error("Shop Colour price is not configured.");
            }

            BW_PRICE = savedBwPrice;
            COLOR_PRICE = savedColorPrice;

            console.log(
                "SHOP PRINT PRICES:",
                {
                    bw: BW_PRICE,
                    color: COLOR_PRICE
                }
            );

            state.shopUuid =
                shop.id || "";

            state.shopId =
                shop.shop_id ||
                state.qrSlug;

            state.shopName =
                shop.shop_name ||
                "Auto Print Shop";

            setText(
                "shopName",
                state.shopName
            );

            setText(
                "shopId",
                "Shop ID: " +
                state.shopId
            );

            const logo =
                $("shopLogo");

            if (
                logo &&
                shop.logo_url
            ) {

                logo.src =
                    shop.logo_url;

                logo.style.display =
                    "block";
            }

            clearError();

            console.log(
                "SHOP LOADED:",
                state.shopName,
                state.shopId,
                state.shopUuid
            );

            calculatePrice();

            return true;

        } catch (err) {

            console.error(
                "SHOP LOAD ERROR:",
                err
            );

            setText(
                "shopName",
                "Shop Connection Failed"
            );

            setText(
                "shopId",
                "Shop ID: " +
                state.qrSlug
            );

            error(
                "Shop details load नहीं हुए: " +
                (
                    err?.message ||
                    "Unknown error"
                )
            );

            return false;
        }
    }

    /* ==============================
       PDF.JS
    ============================== */

    async function loadPdfJS() {

        if (window.pdfjsLib) {
            return true;
        }

        return new Promise(
            function (resolve, reject) {

                const script =
                    document.createElement(
                        "script"
                    );

                script.src =
                    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";

                script.onload =
                    function () {

                        if (
                            window.pdfjsLib
                        ) {

                            window.pdfjsLib
                                .GlobalWorkerOptions
                                .workerSrc =
                                "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

                            resolve(true);

                        } else {

                            reject(
                                new Error(
                                    "PDF.js load failed."
                                )
                            );
                        }
                    };

                script.onerror =
                    function () {

                        reject(
                            new Error(
                                "PDF.js internet load failed."
                            )
                        );
                    };

                document.head.appendChild(
                    script
                );
            }
        );
    }

    async function countPDFPages(file) {

        await loadPdfJS();

        const buffer =
            await file.arrayBuffer();

        const pdf =
            await window.pdfjsLib
                .getDocument({
                    data:
                        new Uint8Array(
                            buffer
                        )
                })
                .promise;

        return pdf.numPages;
    }

    /* ==============================
       PRICE
    ============================== */

    function rate() {

        const price =
            state.printType === "color"
                ? COLOR_PRICE
                : BW_PRICE;

        return Number.isFinite(Number(price))
            ? Number(price)
            : 0;
    }

    function calculatePrice() {

        let pages =
            Number(state.pages || 0);

        if (
            state.mode === "document" &&
            isPDF(state.documentFile)
        ) {
            pages = state.selectedPages.length;
        }

        if (
            state.mode === "idcard"
        ) {

            pages =
                state.frontFile &&
                state.backFile
                    ? 1
                    : 0;
        }

        const total =
            pages *
            state.copies *
            rate();

        state.amount =
            total;

        console.log("PRICE CALCULATION:", {
            pages,
            copies: state.copies,
            rate: rate(),
            total,
            bwPrice: BW_PRICE,
            colorPrice: COLOR_PRICE
        });

        /* Update the complete customer summary */
        setText(
            "copies",
            state.copies
        );

        setText(
            "summaryPages",
            pages
        );

        setText(
            "summaryCopies",
            state.copies
        );

        setText(
            "summaryType",
            state.printType === "color"
                ? "Color"
                : "B&W"
        );

        setText(
            "summaryRate",
            money(rate()) + " / page"
        );

        setText(
            "amount",
            money(total)
        );

        const bw =
            document.querySelector(
                '[data-type="bw"] small'
            );

        const color =
            document.querySelector(
                '[data-type="color"] small'
            );

        if (bw) {

            bw.textContent =
                money(BW_PRICE) +
                " / page";
        }

        if (color) {

            color.textContent =
                money(COLOR_PRICE) +
                " / page";
        }

        if (state.mode === "idcard") {

            setText(
                "pageInfo",
                state.frontFile &&
                state.backFile
                    ? "Front + Back = 1 A4 page"
                    : "Front और Back दोनों upload करें."
            );

            setText(
                "selectedPageInfo",
                state.frontFile &&
                state.backFile
                    ? "1 page • " +
                      money(rate()) +
                      " / page • " +
                      money(total)
                    : "Upload Front + Back"
            );

        } else {

            if (state.documentFile) {

                setText(
                    "pageInfo",
                    isPDF(
                        state.documentFile
                    )
                        ? "PDF pages counted automatically."
                        : "Image = 1 printable page."
                );

                setText(
                    "selectedPageInfo",
                    pages +
                    " page" +
                    (
                        pages === 1
                            ? ""
                            : "s"
                    ) +
                    " • " +
                    money(rate()) +
                    " / page • " +
                    money(total)
                );

            } else {

                setText(
                    "pageInfo",
                    "PDF pages will be counted automatically."
                );

                setText(
                    "selectedPageInfo",
                    "Upload a document to calculate price."
                );
            }
        }
    }

    /* ==============================
       DOCUMENT UPLOAD
    ============================== */

    async function handleDocumentFile(
        file
    ) {

        clearError();

        if (
            !validDocument(file)
        ) {
            return;
        }

        state.mode =
            "document";

        state.documentFile =
            file;

        state.frontFile =
            null;

        state.backFile =
            null;

        setText(
            "singleName",
            file.name
        );

        const fileBox =
            $("singleName");

        if (fileBox) {

            fileBox.classList.add(
                "selected"
            );
        }

        if (isPDF(file)) {

            setText(
                "pageInfo",
                "Counting PDF pages..."
            );

            setText(
                "selectedPageInfo",
                "Please wait..."
            );

            try {

                state.pages =
                    await countPDFPages(
                        file
                    );

                if (
                    !state.pages ||
                    state.pages < 1
                ) {

                    throw new Error(
                        "PDF has no pages."
                    );
                }

                state.selectedPages = allPagesArray();
                const pageInput = $("pageSelectionInput");
                if (pageInput) {
                    pageInput.value = selectedPagesText(state.selectedPages);
                }
                refreshPageSelectionUI();

            } catch (err) {

                console.error(
                    "PDF COUNT ERROR:",
                    err
                );

                state.pages =
                    0;

                error(
                    "PDF pages count नहीं हो पाया. Internet connection check करें और PDF दोबारा select करें."
                );

                calculatePrice();

                return;
            }

        } else {

            state.pages =
                1;
        }

        setText(
            "singleName",
            file.name +
            " • " +
            state.pages +
            (
                state.pages === 1
                    ? " page"
                    : " pages"
            )
        );

        clearError();

        calculatePrice();
    }

    /* ==============================
       ID FRONT
    ============================== */

    function handleFrontFile(
        file
    ) {

        clearError();

        if (
            !validIdFile(
                file,
                "Front"
            )
        ) {
            return;
        }

        state.frontFile =
            file;

        setText(
            "frontName",
            file.name
        );

        const box =
            $("frontName");

        if (box) {

            box.classList.add(
                "selected"
            );
        }

        calculatePrice();
    }

    /* ==============================
       ID BACK
    ============================== */

    function handleBackFile(
        file
    ) {

        clearError();

        if (
            !validIdFile(
                file,
                "Back"
            )
        ) {
            return;
        }

        state.backFile =
            file;

        setText(
            "backName",
            file.name
        );

        const box =
            $("backName");

        if (box) {

            box.classList.add(
                "selected"
            );
        }

        calculatePrice();
    }

    /* ==============================
       PDF PAGE SELECTION
       ADDED: missing helper functions only
    ============================== */

    function allPagesArray() {
        const total = Number(state.pages || 0);
        if (!Number.isInteger(total) || total < 1) {
            return [];
        }

        return Array.from(
            { length: total },
            (_, index) => index + 1
        );
    }

    function selectedPagesText(pages) {
        const list = Array.from(
            new Set(
                (pages || [])
                    .map(Number)
                    .filter(Number.isInteger)
            )
        ).sort((a, b) => a - b);

        if (!list.length) {
            return "";
        }

        const parts = [];
        let start = list[0];
        let previous = list[0];

        for (let i = 1; i < list.length; i++) {
            const current = list[i];

            if (current === previous + 1) {
                previous = current;
                continue;
            }

            parts.push(
                start === previous
                    ? String(start)
                    : start + "-" + previous
            );

            start = current;
            previous = current;
        }

        parts.push(
            start === previous
                ? String(start)
                : start + "-" + previous
        );

        return parts.join(",");
    }

    function parsePageSelection(value) {
        const total = Number(state.pages || 0);
        const raw = String(value || "").trim();

        if (!total) {
            return {
                pages: [],
                error: "पहले PDF upload करें."
            };
        }

        if (!raw) {
            return {
                pages: [],
                error: "कम से कम 1 page select करें."
            };
        }

        const selected = new Set();
        const parts = raw.split(",");

        for (const partValue of parts) {
            const part = partValue.trim();

            if (!part) {
                return {
                    pages: [],
                    error: "Page selection format सही नहीं है. उदाहरण: 1-3,5,8-10"
                };
            }

            if (/^\d+$/.test(part)) {
                const page = Number(part);

                if (page < 1 || page > total) {
                    return {
                        pages: [],
                        error: "Page " + page + " मौजूद नहीं है. PDF में 1 से " + total + " तक pages हैं."
                    };
                }

                selected.add(page);
                continue;
            }

            const match = part.match(/^(\d+)\s*-\s*(\d+)$/);

            if (!match) {
                return {
                    pages: [],
                    error: "Page selection format सही नहीं है. उदाहरण: 1-3,5,8-10"
                };
            }

            let start = Number(match[1]);
            let end = Number(match[2]);

            if (start > end) {
                [start, end] = [end, start];
            }

            if (
                start < 1 ||
                end > total
            ) {
                return {
                    pages: [],
                    error: "Page range 1 से " + total + " के बीच होना चाहिए."
                };
            }

            for (let page = start; page <= end; page++) {
                selected.add(page);
            }
        }

        const pages = Array.from(selected).sort(
            (a, b) => a - b
        );

        if (!pages.length) {
            return {
                pages: [],
                error: "कम से कम 1 page select करें."
            };
        }

        return {
            pages,
            error: ""
        };
    }

    function refreshPageSelectionUI() {
        const box = $("pdfPageSelection");
        const input = $("pageSelectionInput");
        const status = $("selectedPageInfo");
        const selectionError = $("pageSelectionError");

        const isPdfDocument =
            state.mode === "document" &&
            isPDF(state.documentFile) &&
            Number(state.pages || 0) > 0;

        if (box) {
            box.classList.toggle(
                "hidden",
                !isPdfDocument
            );
        }

        if (!isPdfDocument) {
            if (selectionError) {
                selectionError.textContent = "";
                selectionError.classList.add("hidden");
            }
            return;
        }

        if (input) {
            input.value = selectedPagesText(
                state.selectedPages
            );
        }

        if (status) {
            const count = state.selectedPages.length;
            status.textContent =
                count +
                " of " +
                state.pages +
                " pages selected";
        }

        if (selectionError) {
            selectionError.textContent = "";
            selectionError.classList.add("hidden");
        }
    }

    function applyPageSelection() {
        const input = $("pageSelectionInput");
        const result = parsePageSelection(
            input ? input.value : ""
        );

        if (result.error) {
            const selectionError = $("pageSelectionError");

            if (selectionError) {
                selectionError.textContent =
                    result.error;
                selectionError.classList.remove(
                    "hidden"
                );
            } else {
                error(result.error);
            }

            return false;
        }

        state.selectedPages = result.pages;

        if (input) {
            input.value = selectedPagesText(
                state.selectedPages
            );
        }

        refreshPageSelectionUI();
        calculatePrice();
        clearError();

        return true;
    }

    function selectAllPages() {
        state.selectedPages = allPagesArray();

        const input = $("pageSelectionInput");

        if (input) {
            input.value = selectedPagesText(
                state.selectedPages
            );
        }

        refreshPageSelectionUI();
        calculatePrice();
        clearError();
    }

    /* ==============================
       MODE
    ============================== */

    function setMode(
        mode
    ) {

        state.mode =
            mode === "idcard"
                ? "idcard"
                : "document";

        clearError();

        const single =
            $("singleMode");

        const id =
            $("idMode");

        if (single) {

            single.classList.toggle(
                "active",
                state.mode === "document"
            );
        }

        if (id) {

            id.classList.toggle(
                "active",
                state.mode === "idcard"
            );
        }

        if (
            state.mode === "idcard"
        ) {

            $("singleBox")
                ?.classList
                .add("hidden");

            $("idBox")
                ?.classList
                .remove("hidden");

            $("idTypeSection")
                ?.classList
                .remove("hidden");

            state.pages =
                1;

            state.selectedPages = [1];
            refreshPageSelectionUI();

        } else {

            $("singleBox")
                ?.classList
                .remove("hidden");

            $("idBox")
                ?.classList
                .add("hidden");

            $("idTypeSection")
                ?.classList
                .add("hidden");

            if (
                !state.documentFile
            ) {

                state.pages =
                    0;
                state.selectedPages = [];
                refreshPageSelectionUI();
            }
        }

        updateStepNumbers();

        calculatePrice();
    }

    function updateStepNumbers() {

        if (
            state.mode === "idcard"
        ) {

            setText(
                "paperStep",
                "4"
            );

            setText(
                "layoutStep",
                "5"
            );

            setText(
                "printTypeStep",
                "6"
            );

            setText(
                "copiesStep",
                "7"
            );

            setText(
                "mobileStep",
                "8"
            );

        } else {

            setText(
                "paperStep",
                "3"
            );

            setText(
                "layoutStep",
                "4"
            );

            setText(
                "printTypeStep",
                "5"
            );

            setText(
                "copiesStep",
                "6"
            );

            setText(
                "mobileStep",
                "7"
            );
        }
    }

    /* ==============================
       PRINT TYPE
    ============================== */

    function setPrintType(
        type
    ) {

        state.printType =
            type === "color"
                ? "color"
                : "bw";

        document
            .querySelectorAll(
                ".ptype"
            )
            .forEach(
                function (button) {

                    button.classList.toggle(
                        "active",
                        button.dataset.type ===
                        state.printType
                    );
                }
            );

        calculatePrice();
    }

    /* ==============================
       ORIENTATION
    ============================== */

    function setOrientation(
        orientation
    ) {

        state.orientation =
            orientation ===
            "landscape"
                ? "landscape"
                : "portrait";

        document
            .querySelectorAll(
                ".layout"
            )
            .forEach(
                function (button) {

                    button.classList.toggle(
                        "active",
                        button.dataset.layout ===
                        state.orientation
                    );
                }
            );
    }

    /* ==============================
       COPIES
    ============================== */

    function changeCopies(
        amount
    ) {

        state.copies =
            Math.max(
                1,
                Math.min(
                    100,
                    state.copies +
                    amount
                )
            );

        calculatePrice();
    }

    /* ==============================
       MOBILE
    ============================== */

    function updateMobile() {

        const input =
            $("mobile");

        if (!input) return;

        input.value =
            input.value
                .replace(
                    /\D/g,
                    ""
                )
                .slice(
                    0,
                    10
                );

        state.mobile =
            input.value;
    }

    /* ==============================
       VALIDATION
    ============================== */

    function validateOrder() {

        clearError();

        if (!state.shopId) {

            error(
                "Shop ID नहीं मिला. Shop QR से page खोलें."
            );

            return false;
        }

        if (
            state.mode ===
            "document"
        ) {

            if (
                !state.documentFile
            ) {

                error(
                    "पहले Document upload करें."
                );

                return false;
            }

            if (
                !state.pages ||
                state.pages < 1
            ) {

                error(
                    "PDF page count पूरा होने दें."
                );

                return false;
            }

            if (
                isPDF(state.documentFile)
            ) {
                if (!applyPageSelection()) {
                    error("PDF page selection सही करें.");
                    return false;
                }
            }
        }

        if (
            state.mode ===
            "idcard"
        ) {

            if (
                !state.frontFile
            ) {

                error(
                    "ID Card Front upload करें."
                );

                return false;
            }

            if (
                !state.backFile
            ) {

                error(
                    "ID Card Back upload करें."
                );

                return false;
            }
        }

        const mobile =
            String(
                state.mobile || ""
            ).replace(
                /\D/g,
                ""
            );

        if (
            mobile.length !== 10
        ) {

            error(
                "10 अंकों का Mobile Number डालें."
            );

            $("mobile")
                ?.focus();

            return false;
        }

        state.mobile =
            mobile;

        if (
            state.copies < 1
        ) {

            error(
                "Copies कम से कम 1 होनी चाहिए."
            );

            return false;
        }

        calculatePrice();

        if (
            state.amount <= 0
        ) {

            error(
                "Amount ₹0 है. पहले valid file upload करें."
            );

            return false;
        }

        return true;
    }

    /* ==============================
       STORAGE UPLOAD
    ============================== */

    function safeName(
        name
    ) {

        return String(
            name || "file"
        )
            .replace(
                /[^a-zA-Z0-9._-]/g,
                "_"
            )
            .slice(
                0,
                120
            );
    }

    async function uploadFile(
        file,
        type
    ) {

        const random =
            Date.now()
            .toString(36) +
            "-" +
            Math.random()
                .toString(36)
                .slice(2, 10);

        const path =
            "shops/" +
            state.shopId +
            "/" +
            random +
            "-" +
            type +
            "-" +
            safeName(
                file.name
            );

        const result =
            await db.storage
                .from(BUCKET)
                .upload(
                    path,
                    file,
                    {
                        cacheControl:
                            "3600",
                        upsert:
                            false,
                        contentType:
                            file.type ||
                            undefined
                    }
                );

        if (
            result.error
        ) {

            throw new Error(
                "File upload failed: " +
                result.error.message
            );
        }

        return path;
    }

    /* ==============================
       RAZORPAY PAYMENT
       ============================== */

    async function invokeFunction(
        name,
        body
    ) {

        if (
            !db ||
            !db.functions
        ) {

            throw new Error(
                "Payment service is not available."
            );
        }

        const result =
            await db.functions.invoke(
                name,
                {
                    body:
                        body
                }
            );

        if (result.error) {
            throw result.error;
        }

        if (result.data?.error) {

            throw new Error(
                result.data.error
            );
        }

        return result.data;
    }

    async function startRazorpayPayment({
    orderId,
    orderNumber,
    amount
}) {

    if (!window.Razorpay) {
        throw new Error(
            "Razorpay Checkout load नहीं हुआ. Page refresh करें."
        );
    }

    if (
        !orderId ||
        !orderNumber ||
        amount <= 0
    ) {
        throw new Error(
            "Invalid order/payment details."
        );
    }

    // Create Razorpay order on server
    const created =
        await invokeFunction(
            "create-payment",
            {
                order_number: orderNumber
            }
        );

    console.log(
        "RAZORPAY CREATE RESULT:",
        created
    );

    // Backend may return either name
    const razorpayOrderId =
        created?.razorpay_order_id ||
        created?.order_id;

    const razorpayKey =
        created?.key_id;

    const razorpayAmount =
        Number(
            created?.amount ||
            Math.round(amount * 100)
        );

    if (
        !razorpayKey ||
        !razorpayOrderId
    ) {

        console.error(
            "INVALID RAZORPAY RESPONSE:",
            created
        );

        throw new Error(
            created?.error ||
            "Payment order create नहीं हुआ."
        );
    }

    if (
        !razorpayAmount ||
        razorpayAmount <= 0
    ) {
        throw new Error(
            "Invalid Razorpay amount."
        );
    }

    // Open Razorpay Checkout
    await new Promise(
        (resolve, reject) => {

            let finished = false;

            function finishReject(error) {

                if (!finished) {
                    finished = true;
                    reject(error);
                }
            }

            function finishResolve() {

                if (!finished) {
                    finished = true;
                    resolve();
                }
            }

            const rzp =
                new window.Razorpay({

                    key:
                        razorpayKey,

                    amount:
                        razorpayAmount,

                    currency:
                        created?.currency ||
                        "INR",

                    name:
                        state.shopName ||
                        "Sahil Online Services",

                    description:
                        `Print Order ${orderNumber}`,

                    order_id:
                        razorpayOrderId,

                    prefill: {
                        contact:
                            state.mobile
                    },

                    theme: {
                        color:
                            "#162137"
                    },

                    modal: {

                        ondismiss:
                            function () {

                                finishReject(
                                    new Error(
                                        "Payment cancelled. Order print के लिए release नहीं हुआ."
                                    )
                                );
                            }
                    },

                    // Payment success
                    handler:
                        async function (
                            response
                        ) {

                            try {

                                console.log(
                                    "RAZORPAY SUCCESS:",
                                    response
                                );

                                const verified =
                                    await invokeFunction(
                                        "verify-payment",
                                        {
                                            order_number:
                                                orderNumber,

                                            razorpay_order_id:
                                                response.razorpay_order_id,

                                            razorpay_payment_id:
                                                response.razorpay_payment_id,

                                            razorpay_signature:
                                                response.razorpay_signature
                                        }
                                    );

                                console.log(
                                    "VERIFY PAYMENT RESULT:",
                                    verified
                                );

                                if (
                                    !verified ||
                                    !verified.verified
                                ) {

                                    throw new Error(
                                        "Payment verification failed."
                                    );
                                }

                                finishResolve();

                            } catch (e) {

                                console.error(
                                    "VERIFY PAYMENT ERROR:",
                                    e
                                );

                                finishReject(e);
                            }
                        }
                });

            // Payment failed
            rzp.on(
                "payment.failed",
                function (response) {

                    console.error(
                        "RAZORPAY PAYMENT FAILED:",
                        response
                    );

                    finishReject(
                        new Error(
                            response?.error?.description ||
                            "Razorpay payment failed."
                        )
                    );
                }
            );

            // Open payment window
            rzp.open();
        }
    );
}

    /* ==============================
       SUBMIT ORDER
    ============================== */

    async function submitOrder() {

        if (
            state.submitting
        ) {
            return;
        }

        if (
            !validateOrder()
        ) {
            return;
        }

        state.submitting =
            true;

        clearError();

        const button =
            $("submit");

        if (button) {

            button.disabled =
                true;

            button.textContent =
                "Uploading & Saving...";
        }

        try {

            let documentPath =
                null;

            let documentName =
                null;

            let frontPath =
                null;

            let frontName =
                null;

            let backPath =
                null;

            let backName =
                null;

            /* DOCUMENT */

            if (
                state.mode ===
                "document"
            ) {

                documentPath =
                    await uploadFile(
                        state.documentFile,
                        "document"
                    );

                documentName =
                    state.documentFile.name;

            }

            /* ID CARD */

            else {

                frontPath =
                    await uploadFile(
                        state.frontFile,
                        "front"
                    );

                frontName =
                    state.frontFile.name;

                backPath =
                    await uploadFile(
                        state.backFile,
                        "back"
                    );

                backName =
                    state.backFile.name;
            }

            calculatePrice();

            const layout =
                state.orientation ===
                "landscape"
                    ? 2
                    : 1;

            const idType =
                state.mode ===
                "idcard"
                    ? (
                        $("idType")
                            ?.value ||
                        "AADHAAR"
                    )
                    : null;

            /*
             * IMPORTANT:
             *
             * Order is created through
             * server RPC.
             *
             * Do not directly insert
             * into public.orders.
             */

            const result =
                await db.rpc(
                    "create_public_order",
                    {

                        p_qr_slug:
                            state.qrSlug,

                        p_service_id:
                            null,

                        p_mobile:
                            state.mobile,

                        p_print_mode:
                            state.mode ===
                            "idcard"
                                ? "id_card"
                                : "single",

                        p_file_path:
                            documentPath,

                        p_file_name:
                            documentName,

                        p_front_file_path:
                            frontPath,

                        p_front_file_name:
                            frontName,

                        p_back_file_path:
                            backPath,

                        p_back_file_name:
                            backName,

                        p_id_document_type:
                            idType,

                        p_pages:
                            state.mode ===
                            "idcard"
                                ? 1
                                : (
                                    isPDF(state.documentFile)
                                        ? state.selectedPages.length
                                        : 1
                                ),

                        p_selected_pages:
                            state.mode ===
                            "document"
                                ? (
                                    isPDF(state.documentFile)
                                        ? state.selectedPages.slice()
                                        : [1]
                                )
                                : [1],

                        p_layout:
                            layout,

                        p_copies:
                            state.copies,

                        p_print_type:
                            state.printType
                    }
                );

            console.log(
                "CREATE ORDER RESULT:",
                result
            );

            if (
                result.error
            ) {

                throw result.error;
            }

            const order =
                Array.isArray(
                    result.data
                )
                    ? result.data[0]
                    : result.data;

            if (
                !order
            ) {

                throw new Error(
                    "Server ने order number return नहीं किया."
                );
            }

            const orderNumber =
                order.order_number ||
                order.order_id ||
                order.id;

            const serverAmount =
                Number(
                    order.amount ??
                    state.amount
                );

            /*
             * REAL PAYMENT
             *
             * Client does NOT mark payment PAID.
             * Razorpay payment is verified
             * by the backend.
             */

            await startRazorpayPayment({

                orderId:
                    order.order_uuid ||
                    order.id,

                orderNumber:
                    orderNumber,

                amount:
                    serverAmount
            });

            /* ==============================
               SUCCESS
            ============================== */

            setText(
                "rShop",
                state.shopName +
                " (" +
                state.shopId +
                ")"
            );

            setText(
                "rOrder",
                orderNumber
            );

            setText(
                "rPages",
                state.mode ===
                "idcard"
                    ? "1"
                    : state.pages
            );

            setText(
                "rPrint",
                state.printType ===
                "color"
                    ? "Color • " + money(COLOR_PRICE) + " / page"
                    : "Black & White • " + money(BW_PRICE) + " / page"
            );

            setText(
                "rCopies",
                state.copies
            );

            setText(
                "rAmount",
                money(
                    serverAmount
                )
            );

            setText(
                "rPayment",
                "Verified"
            );

            setText(
                "rStatus",
                "Payment verified • Print queued"
            );

            const base =
                window.location.origin +
                window.location.pathname;

            const track =
                $("trackLink");

            const receipt =
                $("receiptLink");

            if (track) {

                track.href =
                    base +
                    "?track=" +
                    encodeURIComponent(
                        orderNumber
                    ) +
                    "&mobile=" +
                    encodeURIComponent(
                        state.mobile
                    );
            }

            if (receipt) {

                receipt.href =
                    base +
                    "?receipt=" +
                    encodeURIComponent(
                        orderNumber
                    ) +
                    "&mobile=" +
                    encodeURIComponent(
                        state.mobile
                    );
            }

            $("success")
                ?.classList
                .add("show");

        } catch (err) {

            console.error(
                "ORDER ERROR:",
                err
            );

            error(
                "Order save नहीं हुआ: " +
                (
                    err?.message ||
                    "Unknown error"
                )
            );

        } finally {

            state.submitting =
                false;

            if (button) {

                button.disabled =
                    false;

                button.textContent =
                    "Submit Print Order";
            }
        }
    }

    /* ==============================
       FILE INPUTS
    ============================== */

    function bindFileInput(
        inputId,
        handler
    ) {

        const input =
            $(inputId);

        if (!input) {

            console.warn(
                "Input missing:",
                inputId
            );

            return;
        }

        input.addEventListener(
            "change",
            async function () {

                const file =
                    this.files &&
                    this.files[0];

                if (!file) {
                    return;
                }

                await handler(
                    file
                );
            }
        );
    }

    /* ==============================
       UPLOAD BOX CLICK
    ============================== */

    function makeUploadBoxClickable(
        selector,
        inputId
    ) {

        const box =
            document.querySelector(
                selector
            );

        const input =
            $(inputId);

        if (
            !box ||
            !input
        ) {
            return;
        }

        box.addEventListener(
            "click",
            function (event) {

                if (
                    event.target.tagName ===
                    "LABEL"
                ) {
                    return;
                }

                input.click();
            }
        );
    }

    /* ==============================
       DRAG DROP
    ============================== */

    function setupDrop(
        selector,
        handler
    ) {

        const box =
            document.querySelector(
                selector
            );

        if (!box) return;

        box.addEventListener(
            "dragover",
            function (event) {

                event.preventDefault();

                box.classList.add(
                    "dragover"
                );
            }
        );

        box.addEventListener(
            "dragleave",
            function () {

                box.classList.remove(
                    "dragover"
                );
            }
        );

        box.addEventListener(
            "drop",
            async function (event) {

                event.preventDefault();

                box.classList.remove(
                    "dragover"
                );

                const file =
                    event.dataTransfer
                        ?.files?.[0];

                if (!file) {
                    return;
                }

                await handler(
                    file
                );
            }
        );
    }

    /* ==============================
       BIND ALL EVENTS
    ============================== */

    function bindEvents() {

        $("singleMode")
            ?.addEventListener(
                "click",
                function () {

                    setMode(
                        "document"
                    );
                }
            );

        $("idMode")
            ?.addEventListener(
                "click",
                function () {

                    setMode(
                        "idcard"
                    );
                }
            );

        bindFileInput(
            "singleFile",
            handleDocumentFile
        );

        bindFileInput(
            "frontFile",
            handleFrontFile
        );

        bindFileInput(
            "backFile",
            handleBackFile
        );

        makeUploadBoxClickable(
            '[data-drop-target="singleFile"]',
            "singleFile"
        );

        makeUploadBoxClickable(
            '[data-drop-target="frontFile"]',
            "frontFile"
        );

        makeUploadBoxClickable(
            '[data-drop-target="backFile"]',
            "backFile"
        );

        setupDrop(
            '[data-drop-target="singleFile"]',
            handleDocumentFile
        );

        setupDrop(
            '[data-drop-target="frontFile"]',
            handleFrontFile
        );

        setupDrop(
            '[data-drop-target="backFile"]',
            handleBackFile
        );

        $("minus")
            ?.addEventListener(
                "click",
                function () {

                    changeCopies(
                        -1
                    );
                }
            );

        $("plus")
            ?.addEventListener(
                "click",
                function () {

                    changeCopies(
                        1
                    );
                }
            );

        document
            .querySelectorAll(
                ".ptype"
            )
            .forEach(
                function (button) {

                    button.addEventListener(
                        "click",
                        function () {

                            setPrintType(
                                button.dataset.type
                            );
                        }
                    );
                }
            );

        document
            .querySelectorAll(
                ".layout"
            )
            .forEach(
                function (button) {

                    button.addEventListener(
                        "click",
                        function () {

                            setOrientation(
                                button.dataset.layout
                            );
                        }
                    );
                }
            );

        $("mobile")
            ?.addEventListener(
                "input",
                updateMobile
            );

        $("applyPageSelection")
            ?.addEventListener(
                "click",
                applyPageSelection
            );

        $("selectAllPages")
            ?.addEventListener(
                "click",
                selectAllPages
            );

        $("pageSelectionInput")
            ?.addEventListener(
                "keydown",
                function (event) {
                    if (event.key === "Enter") {
                        event.preventDefault();
                        applyPageSelection();
                    }
                }
            );

        $("submit")
            ?.addEventListener(
                "click",
                submitOrder
            );

        $("done")
            ?.addEventListener(
                "click",
                function () {

                    $("success")
                        ?.classList
                        .remove(
                            "show"
                        );
                }
            );
    }

    /* ==============================
       START
    ============================== */

    async function init() {

        console.log(
            "================================="
        );

        console.log(
            "AUTO PRINT CUSTOMER.JS FINAL"
        );

        console.log(
            "================================="
        );

        bindEvents();

        setMode(
            "document"
        );

        setPrintType(
            "bw"
        );

        setOrientation(
            "portrait"
        );

        state.copies =
            1;

        state.pages =
            0;

        state.selectedPages = [];

        calculatePrice();

        await loadShop();

        console.log(
            "FINAL STATE:",
            state
        );
    }

    /* ==============================
       PUBLIC API
    ============================== */

    window.AutoPrintCustomer = {

        state,

        calculatePrice,

        setMode,

        setPrintType,

        setOrientation,

        changeCopies,

        handleDocumentFile,

        handleFrontFile,

        handleBackFile,

        submitOrder
    };

    if (
        document.readyState ===
        "loading"
    ) {

        document.addEventListener(
            "DOMContentLoaded",
            init
        );

    } else {

        init();
    }

})();
