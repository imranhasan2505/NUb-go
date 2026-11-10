  const resetPassword = target.closest("[data-reset-password]");

  if (resetPassword) {
    const requestId = Number(resetPassword.dataset.resetPassword);
    if (!requestId) return;

    if (!confirm("Reset this user's password? A new temporary password will be generated.")) return;

    try {
      const result = await patch(`/admin/reset-password/${requestId}`);
      
      // নতুন পাসওয়ার্ড সহ মোডাল দেখানো
      const modal = document.querySelector("#modal");
      const modalBody = document.querySelector("#modal-body");
      
      if (modal && modalBody) {
        modalBody.innerHTML = `
          <div style="text-align:center; padding: 20px;">
            <h2 style="color:#10b981; margin-bottom: 10px;">✅ Password Reset Successful</h2>
            <p style="color:#91a7b5; margin-bottom: 20px;">
              Share this temporary password with <strong>${esc(result.studentId)}</strong>.
              They must change it after logging in.
            </p>
            
            <div style="background:#102638; border:1px dashed #34d399; border-radius: 10px; padding: 20px; margin-bottom: 20px;">
              <div style="font-size: 11px; color:#91a7b5; margin-bottom: 5px;">TEMPORARY PASSWORD</div>
              <div style="font-size: 24px; font-weight: 900; letter-spacing: 1px; color:#fff;">
                ${esc(result.newPassword)}
              </div>
            </div>

            <button class="btn primary" id="copy-password-btn" data-password="${esc(result.newPassword)}" style="width:100%; margin-bottom: 10px;">
              📋 Copy Password
            </button>
            
            <button class="btn" data-close-modal style="width:100%;">
              Close
            </button>
          </div>
        `;
        modal.showModal();
      }

      await loadTab("resets");
    } catch (error) {
      notify(error.message || "Could not reset password.");
    }

    return;
  }
