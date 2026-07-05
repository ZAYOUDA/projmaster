const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');

initializeApp();

// Callable function: change any user's password
// Security: caller must be authenticated (UI AdminRoute ensures admin-only access)
exports.changeUserPassword = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Authentification requise.');
  }

  const { uid, newPassword } = request.data;
  if (!uid || !newPassword) {
    throw new HttpsError('invalid-argument', 'uid et newPassword sont requis.');
  }
  if (newPassword.length < 6) {
    throw new HttpsError('invalid-argument', 'Le mot de passe doit faire au moins 6 caractères.');
  }

  await getAuth().updateUser(uid, { password: newPassword });
  return { success: true };
});
