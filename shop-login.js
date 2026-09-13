const db = window.supabaseClient;

const $ = (id) => document.getElementById(id);

const form = $("loginForm");
const button = $("loginButton");
const errorBox = $("err");

function showError(message) {
    errorBox.textContent = message;
    errorBox.style.display = "block";
}

function clearError() {
    errorBox.textContent = "";
    errorBox.style.display = "none";
}

form.addEventListener("submit", async (e) => {
    e.preventDefault();

    clearError();

    const email = $("email").value.trim().toLowerCase();
    const password = $("password").value;

    if (!email) {
        showError("Please enter your email.");
        return;
    }

    if (!password) {
        showError("Please enter your password.");
        return;
    }

    button.disabled = true;
    button.textContent = "Logging in...";

    try {
        // 1. Login
        const { data, error } =
            await db.auth.signInWithPassword({
                email,
                password
            });

        if (error) {
            throw error;
        }

        if (!data || !data.user) {
            throw new Error("Login failed. User session was not created.");
        }

        // 2. Check Shop
        const {
            data: shop,
            error: shopError
        } = await db
            .from("shops")
            .select("id, shop_id, shop_name, status")
            .eq("owner_user_id", data.user.id)
            .maybeSingle();

        if (shopError) {
            throw shopError;
        }

        if (!shop) {
            throw new Error(
                "Your account is not linked to a Shop yet. Please complete Shop registration."
            );
        }

        // 3. Shop status
        const status = String(shop.status || "").toLowerCase();

        if (
            status === "inactive" ||
            status === "suspended" ||
            status === "blocked" ||
            status === "maintenance"
        ) {
            throw new Error(
                `This shop is currently ${status}. Please contact Super Admin.`
            );
        }

        // 4. Save basic shop info locally
        localStorage.setItem(
            "autoprint_shop",
            JSON.stringify({
                id: shop.id,
                shop_id: shop.shop_id,
                shop_name: shop.shop_name,
                owner_user_id: data.user.id
            })
        );

        // 5. Open Dashboard
        button.textContent = "Opening Dashboard...";

        window.location.href = "shop-dashboard.html";

    } catch (error) {

        console.error("SHOP LOGIN ERROR:", error);

        showError(
            error?.message ||
            "Unable to login. Please try again."
        );

        button.disabled = false;
        button.textContent = "🔐 Login";
    }
});