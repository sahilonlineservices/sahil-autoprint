document.addEventListener("DOMContentLoaded", () => {

  const db = window.supabaseClient;

  const form = document.getElementById("superAdminLoginForm");
  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");
  const loginButton = document.getElementById("loginButton");
  const messageBox = document.getElementById("message");
  const showPasswordButton = document.getElementById("showPassword");


  // -----------------------------------------
  // Message
  // -----------------------------------------

  function showMessage(text, type = "") {

    if (!messageBox) return;

    messageBox.textContent = text;
    messageBox.className = "message";

    if (type) {
      messageBox.classList.add(type);
    }
  }


  // -----------------------------------------
  // Show / Hide Password
  // -----------------------------------------

  if (showPasswordButton && passwordInput) {

    showPasswordButton.addEventListener("click", () => {

      if (passwordInput.type === "password") {

        passwordInput.type = "text";
        showPasswordButton.textContent = "Hide";

      } else {

        passwordInput.type = "password";
        showPasswordButton.textContent = "Show";

      }

    });

  }


  // -----------------------------------------
  // Form Check
  // -----------------------------------------

  if (!form) {

    console.error(
      "Super Admin Login Form not found."
    );

    return;
  }


  // -----------------------------------------
  // LOGIN
  // -----------------------------------------

  form.addEventListener("submit", async (event) => {

    event.preventDefault();


    const email =
      emailInput.value.trim().toLowerCase();

    const password =
      passwordInput.value;


    if (!email || !password) {

      showMessage(
        "Please enter email and password.",
        "error"
      );

      return;
    }


    if (!db) {

      showMessage(
        "Supabase connection not loaded. Check supabase-config.js.",
        "error"
      );

      return;
    }


    loginButton.disabled = true;
    loginButton.textContent = "Checking...";

    showMessage("");


    try {

      // =====================================
      // STEP 1
      // SUPABASE AUTH LOGIN
      // =====================================

      const {
        data: authData,
        error: authError
      } = await db.auth.signInWithPassword({

        email: email,
        password: password

      });


      if (authError) {

        throw new Error(
          authError.message
        );

      }


      if (!authData || !authData.user) {

        throw new Error(
          "Admin account could not be loaded."
        );

      }


      // =====================================
      // STEP 2
      // CHECK SUPER ADMIN
      //
      // IMPORTANT:
      // platform_admins table has:
      // user_id
      // email
      // name
      // active
      //
      // There is NO role column.
      // =====================================

      const {
        data: adminData,
        error: adminError
      } = await db
        .from("platform_admins")
        .select(
          "user_id,email,name,active"
        )
        .eq(
          "user_id",
          authData.user.id
        )
        .maybeSingle();


      if (adminError) {

        console.error(
          "platform_admins error:",
          adminError
        );


        await db.auth.signOut();


        throw new Error(
          "Super Admin verification failed: " +
          adminError.message
        );

      }


      // =====================================
      // ADMIN NOT FOUND
      // =====================================

      if (!adminData) {

        await db.auth.signOut();


        throw new Error(
          "This account is not registered as a Super Admin."
        );

      }


      // =====================================
      // ADMIN INACTIVE
      // =====================================

      if (adminData.active === false) {

        await db.auth.signOut();


        throw new Error(
          "This Super Admin account is inactive."
        );

      }


      // =====================================
      // SAVE ADMIN SESSION
      // =====================================

      localStorage.setItem(
        "autoPrintSuperAdmin",
        JSON.stringify({

          userId: authData.user.id,

          email:
            adminData.email ||
            authData.user.email,

          name:
            adminData.name ||
            "Super Admin"

        })
      );


      // =====================================
      // SUCCESS
      // =====================================

      showMessage(
        "Login successful. Opening Super Admin Panel...",
        "success"
      );


      loginButton.textContent =
        "Login Successful";


      setTimeout(() => {

        window.location.href =
          "super-admin.html";

      }, 700);


    } catch (error) {

      console.error(
        "Super Admin Login Error:",
        error
      );


      showMessage(
        error.message ||
        "Unable to login.",
        "error"
      );


      loginButton.disabled = false;

      loginButton.textContent =
        "Login as Super Admin";

    }

  });

});