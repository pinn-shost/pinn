/* pinn. – Data export (js/exportieren.js)
   Part of the app code that used to be a single block in index.html. Classic script, no build step:
   it is loaded right after the inline script of index.html and before the other files in js/
   (the load order is listed at the bottom of index.html and in pinn-setup.sh).
   Contents: the data export of the whole family as a ZIP (PINN_EXPORT_TEXTE, pinnExportText, loadPinnExportScript, openPinnExport, exportRefreshSub). The export module itself lives in pb_public/datenexport.js and is only loaded when first opened. */

/* ==========================================================
   Data export (whole family as a ZIP – data + documents)
   ----------------------------------------------------------
   The module lives in pb_public/datenexport.js and is only loaded when first opened
   (own texts in ten languages, Russian still hidden). The browser builds the ZIP; the server only delivers collections
   and files (pb_hooks/export.pb.js + pinn-export.js).
   - Settings → System → Data: "Export family" (admins, not with child lock)
   - Main admin → Families: "📦 Export" per family (complete, e.g. for moving)
   ========================================================== */
const PINN_EXPORT_TEXTE = {
  de: { btn: '📦 {F} exportieren', kurz: '📦 Export', text: 'Alle Daten {Fd} als ZIP-Datei – mit Dokumenten, Belegen und Bildern. Zum Beispiel für den Umzug auf ein anderes NAS oder als eigene Sicherung.', laden: 'Der Export konnte nicht geladen werden (pb_public/datenexport.js fehlt?).', F: 'Familie', FW: 'WG', Fd: 'der Familie', FWd: 'der WG' },
  en: { btn: '📦 Export {F}', kurz: '📦 Export', text: 'All data {Fd} as a ZIP file – including documents, receipts and pictures. For example to move to another NAS or as your own backup.', laden: 'The export could not be loaded (pb_public/datenexport.js missing?).', F: 'family', FW: 'flatshare', Fd: 'of your family', FWd: 'of your flatshare' },
  fr: { btn: '📦 Exporter la {F}', kurz: '📦 Export', text: 'Toutes les données {Fd} dans un fichier ZIP – avec documents, justificatifs et images. Par exemple pour déménager sur un autre NAS ou comme sauvegarde personnelle.', laden: 'L\'export n\'a pas pu être chargé (pb_public/datenexport.js manquant ?).', F: 'famille', FW: 'colocation', Fd: 'de la famille', FWd: 'de la colocation' },
  es: { btn: '📦 Exportar {F}', kurz: '📦 Exportar', text: 'Todos los datos {Fd} en un archivo ZIP – con documentos, recibos e imágenes. Por ejemplo para mudarse a otro NAS o como copia de seguridad propia.', laden: 'No se pudo cargar la exportación (¿falta pb_public/datenexport.js?).', F: 'familia', FW: 'piso compartido', Fd: 'de la familia', FWd: 'del piso compartido' },
  it: { btn: '📦 Esporta {F}', kurz: '📦 Esporta', text: 'Tutti i dati {Fd} in un file ZIP, con documenti, ricevute e immagini. Ad esempio per passare a un altro NAS o come backup personale.', laden: 'Impossibile caricare l’esportazione (manca pb_public/datenexport.js?).', F: 'famiglia', FW: 'casa condivisa', Fd: 'della famiglia', FWd: 'della casa condivisa' },
  pt: { btn: '📦 Exportar {F}', kurz: '📦 Exportar', text: 'Todos os dados {Fd} em um arquivo ZIP – com documentos, comprovantes e imagens. Por exemplo, para mudar para outro NAS ou como backup próprio.', laden: 'Não foi possível carregar a exportação (falta pb_public/datenexport.js?).', F: 'família', FW: 'casa compartilhada', Fd: 'da família', FWd: 'da casa compartilhada' },
  zh: { btn: '📦 导出{F}', kurz: '📦 导出', text: '将{Fd}的全部数据导出为一个 ZIP 文件——包含文档、凭证和图片。例如用于迁移到另一台 NAS，或作为你自己的备份。', laden: '无法加载导出功能（缺少 pb_public/datenexport.js？）。', F: '家庭', FW: '合租', Fd: '你的家庭', FWd: '你的合租' },
  ja: { btn: '📦 {F}をエクスポート', kurz: '📦 エクスポート', text: '{Fd}のすべてのデータを1つの ZIP ファイルに。書類、領収書、画像も含みます。別の NAS への引っ越しや、自分用のバックアップなどに。', laden: 'エクスポートを読み込めませんでした（pb_public/datenexport.js がありませんか？）。', F: '家族', FW: 'ルームシェア', Fd: '家族', FWd: 'ルームシェア' },
  ko: { btn: '📦 {F} 내보내기', kurz: '📦 내보내기', text: '{Fd}의 모든 데이터를 ZIP 파일 하나로 – 문서, 영수증, 사진까지 포함해요. 다른 NAS로 옮기거나 개인 백업용으로 쓸 수 있어요.', laden: '내보내기를 불러올 수 없어요(pb_public/datenexport.js가 없나요?).', F: '가족', FW: '셰어하우스', Fd: '가족', FWd: '셰어하우스' },
  // Russian (since 1.120.0, still hidden in the app): {F} is used in the accusative ("export the family")
  ru: { btn: '📦 Экспортировать {F}', kurz: '📦 Экспорт', text: 'Все данные {Fd} одним ZIP-файлом – вместе с документами, чеками и изображениями. Например, для переезда на другой NAS или как собственная резервная копия.', laden: 'Не удалось загрузить экспорт (нет pb_public/datenexport.js?).', F: 'семью', FW: 'квартиру', Fd: 'вашей семьи', FWd: 'вашей квартиры' },
};
function pinnExportText(key) {
  const l = (window.PINN_I18N && window.PINN_I18N.current) || 'en';
  const d = PINN_EXPORT_TEXTE[l] || PINN_EXPORT_TEXTE.en;
  const wg = typeof householdType !== 'undefined' && householdType === 'wg';
  return String(d[key] || PINN_EXPORT_TEXTE.en[key] || key)
    .replace(/\{Fd\}/g, wg ? d.FWd : d.Fd).replace(/\{F\}/g, wg ? d.FW : d.F);
}
let pinnExportLoading = null;
function loadPinnExportScript() {
  if (window.PinnExport) return Promise.resolve(window.PinnExport);
  if (pinnExportLoading) return pinnExportLoading;
  pinnExportLoading = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'datenexport.js?v=' + APP_VERSION;
    s.onload = () => (window.PinnExport ? resolve(window.PinnExport) : reject(new Error('PinnExport missing')));
    s.onerror = () => { pinnExportLoading = null; s.remove(); reject(new Error('datenexport.js missing')); };
    document.head.appendChild(s);
  });
  return pinnExportLoading;
}
async function openPinnExport(familieId) {
  try {
    const px = await loadPinnExportScript();
    px.open({ apiFetch, familie: familieId || '', wg: typeof householdType !== 'undefined' && householdType === 'wg' });
  } catch (e) {
    alert(pinnExportText('laden'));
  }
}
// Settings → System → Data: export only for admins (not for guests and child lock)
function exportRefreshSub() {
  const sub = document.getElementById('dataExportSub');
  if (!sub) return;
  const show = (isCurrentUserAdmin() || isCurrentUserMainAdmin()) && !isCurrentUserGuest()
    && !(typeof childLockActive === 'function' && childLockActive());
  sub.classList.toggle('hidden', !show);
  if (!show) return;
  document.getElementById('dataExportText').textContent = pinnExportText('text');
  const b = document.getElementById('dataExportBtn');
  b.textContent = pinnExportText('btn');
  b.onclick = () => openPinnExport('');
}

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('exportieren');
