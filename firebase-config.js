/* Firebase 網頁應用程式設定（專案：Cheunyei enterprise System）。
 * 這些值本來就會出現在網頁裡，不是機密；資料的安全靠 Firestore 安全規則與登入。 */
window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyB4c9xHfP1n3of6aOC32JwKPyu-u7Ka5_M",
  authDomain: "cheunyei-enterprise-system.firebaseapp.com",
  projectId: "cheunyei-enterprise-system",
  messagingSenderId: "448367357673",
  appId: "1:448367357673:web:4b9b6543ea490fa6b48a78"
};

/* 集合名稱前綴：這套系統的資料都會放在「inv_」開頭的集合（例如 inv_orders），
 * 避免和你原本資料庫裡的集合撞名。建立好資料後請不要再改這個值。 */
window.INV_PREFIX = "inv_";
