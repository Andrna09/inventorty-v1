/**
 * ==========================================
 * 1. KONFIGURASI GLOBAL
 * ==========================================
 */
const CONFIG = {
  SHEET_NAME: {
    PRODUK: "DataProduk",
    MASUK: "ProdukMasuk",
    KELUAR: "ProdukKeluar",
    OPNAME: "StokOpname",
    GUDANG: "DataGudang"
  },
  COL_PRODUK: { KODE: 0, NAMA: 1, JENIS: 2, SATUAN: 3, STOK_MIN: 4, STATUS: 5, STOK: 6 },
  COL_MASUK: { TANGGAL: 0, KODE: 1, NAMA: 2, JENIS: 3, SATUAN: 4, JUMLAH: 5, GUDANG: 6 },
  COL_KELUAR: { TANGGAL: 0, KODE: 1, NAMA: 2, JENIS: 3, SATUAN: 4, GUDANG: 5, PJ: 6, JUMLAH: 7 }
};

/**
 * ==========================================
 * 2. ROUTING & NAVIGASI (FITUR SPA BARU)
 * ==========================================
 */
function doGet(e) {
  // Selalu load 'Main.html' sebagai cangkang utama
  return HtmlService.createTemplateFromFile('Main')
    .evaluate()
    .setTitle("Inventory System Pro")
    .setFaviconUrl("https://cdn-icons-png.flaticon.com/128/3500/3500823.png")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// Fungsi ini dipanggil oleh Javascript di Main.html untuk mengambil isi halaman
function loadPageContent(pageName) {
  const pageMap = {
    'dashboard': 'Dashboard',
    'produk': 'Produk',
    'barang-masuk': 'BarangMasuk',
    'barang-keluar': 'BarangKeluar',
    'stok-opname': 'StokOpname',
    'laporan-opname': 'LaporanOpname',
    'laporan-barang': 'LaporanPerBarang'
  };
  
  const fileName = pageMap[pageName] || 'Dashboard';
  try {
    return HtmlService.createHtmlOutputFromFile(fileName).getContent();
  } catch (e) {
    return `<h3>Error: Halaman ${fileName} tidak ditemukan.</h3>`;
  }
}

function getAppUrl() { return ScriptApp.getService().getUrl(); }

/**
 * ==========================================
 * 3. FUNGSI TRANSAKSI (DENGAN LOCKSERVICE)
 * ==========================================
 */

// --- BARANG MASUK ---
function addBarangMasuk(tglMasuk, kodeBarang, jumlah, gudang) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(30000); } catch (e) { return { success: false, message: "Server sibuk." }; }

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const produkSheet = ss.getSheetByName(CONFIG.SHEET_NAME.PRODUK);
    const masukSheet = ss.getSheetByName(CONFIG.SHEET_NAME.MASUK);
    
    // Cari Produk
    const produkData = produkSheet.getDataRange().getValues();
    let produkRow = -1;
    let produk = null;
    const searchKode = String(kodeBarang).trim().toLowerCase();

    for (let i = 1; i < produkData.length; i++) {
      if (String(produkData[i][CONFIG.COL_PRODUK.KODE]).trim().toLowerCase() === searchKode) {
        produk = produkData[i];
        produkRow = i + 1;
        break;
      }
    }
    
    if (!produk) throw new Error(`Kode '${kodeBarang}' tidak ditemukan.`);

    // Simpan Transaksi
    masukSheet.appendRow([
      tglMasuk, produk[CONFIG.COL_PRODUK.KODE], produk[CONFIG.COL_PRODUK.NAMA], 
      produk[CONFIG.COL_PRODUK.JENIS], produk[CONFIG.COL_PRODUK.SATUAN], jumlah, gudang
    ]);

    // Update Stok
    const stokBaru = Number(produk[CONFIG.COL_PRODUK.STOK] || 0) + Number(jumlah);
    produkSheet.getRange(produkRow, CONFIG.COL_PRODUK.STOK + 1).setValue(stokBaru);

    // Update Status
    const min = Number(produk[CONFIG.COL_PRODUK.STOK_MIN] || 0);
    produkSheet.getRange(produkRow, CONFIG.COL_PRODUK.STATUS + 1).setValue(stokBaru <= min ? "Barang Kosong" : "Tersedia");

    return { success: true, message: `Stok ${produk[CONFIG.COL_PRODUK.NAMA]} jadi ${stokBaru}` };

  } catch (error) { return { success: false, message: error.message }; } finally { lock.releaseLock(); }
}

// --- BARANG KELUAR ---
function addBarangKeluar(tglKeluar, kodeBarang, jumlah, gudang, penanggungJawab) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(30000); } catch (e) { return { success: false, message: "Server sibuk." }; }

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const produkSheet = ss.getSheetByName(CONFIG.SHEET_NAME.PRODUK);
    const keluarSheet = ss.getSheetByName(CONFIG.SHEET_NAME.KELUAR);
    
    const produkData = produkSheet.getDataRange().getValues();
    let produkRow = -1;
    let produk = null;
    const searchKode = String(kodeBarang).trim().toLowerCase();

    for (let i = 1; i < produkData.length; i++) {
      if (String(produkData[i][CONFIG.COL_PRODUK.KODE]).trim().toLowerCase() === searchKode) {
        produk = produkData[i];
        produkRow = i + 1;
        break;
      }
    }
    
    if (!produk) throw new Error("Kode barang tidak ditemukan.");

    const stokLama = Number(produk[CONFIG.COL_PRODUK.STOK] || 0);
    if (stokLama < Number(jumlah)) return { success: false, message: `Stok kurang! Sisa: ${stokLama}` };

    keluarSheet.appendRow([
      tglKeluar, produk[CONFIG.COL_PRODUK.KODE], produk[CONFIG.COL_PRODUK.NAMA], 
      produk[CONFIG.COL_PRODUK.JENIS], produk[CONFIG.COL_PRODUK.SATUAN], gudang, penanggungJawab, jumlah
    ]);

    const stokBaru = stokLama - Number(jumlah);
    produkSheet.getRange(produkRow, CONFIG.COL_PRODUK.STOK + 1).setValue(stokBaru);

    const min = Number(produk[CONFIG.COL_PRODUK.STOK_MIN] || 0);
    produkSheet.getRange(produkRow, CONFIG.COL_PRODUK.STATUS + 1).setValue(stokBaru <= min ? "Barang Kosong" : "Tersedia");

    return { success: true, message: `Berhasil keluar. Sisa stok: ${stokBaru}` };

  } catch (e) { return { success: false, message: e.message }; } finally { lock.releaseLock(); }
}

/**
 * ==========================================
 * 4. FUNGSI BANTUAN (READ DATA & DASHBOARD)
 * ==========================================
 */
function getProdukByBarcode(kode) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEET_NAME.PRODUK);
  const data = sheet.getDataRange().getValues();
  const search = String(kode).trim().toLowerCase();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][CONFIG.COL_PRODUK.KODE]).trim().toLowerCase() === search) {
      return {
        kode: data[i][CONFIG.COL_PRODUK.KODE], nama: data[i][CONFIG.COL_PRODUK.NAMA],
        jenis: data[i][CONFIG.COL_PRODUK.JENIS], satuan: data[i][CONFIG.COL_PRODUK.SATUAN],
        stok: Number(data[i][CONFIG.COL_PRODUK.STOK]) || 0
      };
    }
  }
  return null;
}

function getDashboardData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const pS = ss.getSheetByName(CONFIG.SHEET_NAME.PRODUK);
  const mS = ss.getSheetByName(CONFIG.SHEET_NAME.MASUK);
  const kS = ss.getSheetByName(CONFIG.SHEET_NAME.KELUAR);
  
  return {
    success: true,
    data: {
      totalProduk: Math.max(0, pS.getLastRow() - 1),
      totalMasuk: Math.max(0, mS.getLastRow() - 1),
      totalKeluar: Math.max(0, kS.getLastRow() - 1),
      greeting: "Halo Admin",
      userEmail: Session.getActiveUser().getEmail()
    }
  };
}

function getGudangList() { return ["Gudang 1", "Gudang 2", "Gudang 3"]; }
function getDataBarangMasuk(f, p, l, s) { return getPaginatedData(CONFIG.SHEET_NAME.MASUK, f, CONFIG.COL_MASUK.GUDANG, p, l, s); }
function getDataBarangKeluar(f, p, l, s) { return getPaginatedData(CONFIG.SHEET_NAME.KELUAR, f, CONFIG.COL_KELUAR.GUDANG, p, l, s); }

// Helper Pagination
function getPaginatedData(sName, fVal, fCol, page, limit, search) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sName);
  if (!sheet || sheet.getLastRow() <= 1) return { data: [], totalPages: 0 };
  
  const raw = sheet.getRange(2, 1, sheet.getLastRow()-1, sheet.getLastColumn()).getValues();
  let data = raw.map((r, i) => ({ d: r, idx: i+2 }));
  
  if (search) {
    const s = search.toLowerCase();
    data = data.filter(r => String(r.d[1]).toLowerCase().includes(s) || String(r.d[2]).toLowerCase().includes(s));
  }
  if (fVal) data = data.filter(r => String(r.d[fCol]) === String(fVal));
  
  data.sort((a, b) => new Date(b.d[0]) - new Date(a.d[0]));
  
  const total = data.length;
  const paged = data.slice((page-1)*limit, page*limit).map(r => {
    if(r.d[0] instanceof Date) r.d[0] = Utilities.formatDate(r.d[0], Session.getScriptTimeZone(), "yyyy-MM-dd");
    r.d.push(r.idx);
    return r.d;
  });
  
  return { data: paged, currentPage: page, totalPages: Math.ceil(total/limit), totalData: total };
}

// Fungsi Hapus (Undo)
function hapusBarangMasuk(idx) { return hapusTransaksi(CONFIG.SHEET_NAME.MASUK, idx, CONFIG.COL_MASUK.KODE, CONFIG.COL_MASUK.JUMLAH, -1); }
function hapusBarangKeluar(idx) { return hapusTransaksi(CONFIG.SHEET_NAME.KELUAR, idx, CONFIG.COL_KELUAR.KODE, CONFIG.COL_KELUAR.JUMLAH, 1); }

function hapusTransaksi(sheetName, idx, colKode, colJml, multiplier) {
  const lock = LockService.getScriptLock();
  try { lock.waitLock(30000); } catch(e) { return "Busy"; }
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(sheetName);
    const row = sheet.getRange(idx, 1, 1, sheet.getLastColumn()).getValues()[0];
    sheet.deleteRow(idx);
    
    // Update Master
    const pSheet = ss.getSheetByName(CONFIG.SHEET_NAME.PRODUK);
    const pData = pSheet.getDataRange().getValues();
    const sKode = String(row[colKode]).trim().toLowerCase();
    
    for(let i=1; i<pData.length; i++) {
      if(String(pData[i][CONFIG.COL_PRODUK.KODE]).trim().toLowerCase() === sKode) {
        const stok = Number(pData[i][CONFIG.COL_PRODUK.STOK]) + (Number(row[colJml]) * multiplier);
        pSheet.getRange(i+1, CONFIG.COL_PRODUK.STOK+1).setValue(stok);
        return "Terhapus & Stok Updated";
      }
    }
    return "Terhapus (Produk tidak ditemukan di master)";
  } finally { lock.releaseLock(); }
}
