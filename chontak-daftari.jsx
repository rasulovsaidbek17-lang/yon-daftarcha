import React, { useState, useEffect, useMemo } from "react";
import {
  Plus,
  Receipt,
  Coins,
  ArrowLeftRight,
  Trash2,
  X,
  AlertTriangle,
  Undo2,
  BookOpen,
  ChevronDown,
  ChevronUp,
  Lock,
  Unlock,
  Link2,
  Copy,
  RefreshCw,
  Users,
  Check,
} from "lucide-react";

const STORAGE_KEY = "chontak-daftari-data";
const FAMILY_CODE_KEY = "chontak-family-code";
const SYNC_META_KEY = "chontak-sync-meta";

// Bulutli sinxronizatsiya: Firebase Realtime Database URL (oxirida .firebaseio.com)
// Bo'sh qoldirsangiz — faqat mahalliy saqlash ishlaydi (qo'llanma pastda).
const FIREBASE_DB_URL = "";

const SYNC_POLL_MS = 5000;
const EMOJIS = ["🎓", "🚌", "🎮", "🍔", "🎁", "🎵", "🛍️", "☕", "🏠", "⚽", "📚", "💊"];

const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
const nowISO = () => new Date().toISOString();

const FAMILY_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateFamilyCode() {
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += FAMILY_CODE_CHARS[Math.floor(Math.random() * FAMILY_CODE_CHARS.length)];
  }
  return code;
}

function normalizeFamilyCode(raw) {
  return String(raw || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
}

function firebaseEnabled() {
  return Boolean(FIREBASE_DB_URL && FIREBASE_DB_URL.includes("firebaseio.com"));
}

function familyStorageKey(code) {
  return `${STORAGE_KEY}-${code}`;
}

async function cloudFetchFamily(code) {
  if (!firebaseEnabled()) return null;
  try {
    const res = await fetch(`${FIREBASE_DB_URL}/families/${code}.json`);
    if (!res.ok) return null;
    const payload = await res.json();
    if (!payload || typeof payload !== "object") return null;
    return payload;
  } catch {
    return null;
  }
}

async function cloudPushFamily(code, data, updatedAt) {
  if (!firebaseEnabled()) return false;
  try {
    const res = await fetch(`${FIREBASE_DB_URL}/families/${code}.json`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        categories: data.categories,
        debts: data.debts,
        transactions: data.transactions,
        adminPin: data.adminPin,
        updatedAt,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function formatMoney(n) {
  const val = Math.round(Number(n) || 0);
  const sign = val < 0 ? "-" : "";
  const abs = Math.abs(val).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${sign}${abs} so'm`;
}

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleDateString("uz-UZ", { day: "2-digit", month: "short" });
  } catch {
    return "";
  }
}

function seedData() {
  const maktabId = uid();
  const transportId = uid();
  const oyinId = uid();
  const shirinId = uid();
  const t0 = Date.now();
  const iso = (daysAgo) => new Date(t0 - daysAgo * 86400000).toISOString();

  const categories = [
    { id: maktabId, name: "Maktab", emoji: "🎓", budget: 1000, spent: 220 },
    { id: transportId, name: "Transport", emoji: "🚌", budget: 200, spent: 200 },
    { id: oyinId, name: "O'yin-kulgi", emoji: "🎮", budget: 300, spent: 80 },
    { id: shirinId, name: "Shirinlik", emoji: "🍬", budget: 100, spent: 40 },
  ];

  const debts = [
    { id: uid(), lenderId: shirinId, borrowerId: transportId, amount: 50, date: iso(1) },
  ];

  const transactions = [
    { id: uid(), date: iso(6), type: "topup", categoryId: maktabId, label: "🎓 Maktab ochildi", amount: 1000 },
    { id: uid(), date: iso(6), type: "topup", categoryId: transportId, label: "🚌 Transport ochildi", amount: 150 },
    { id: uid(), date: iso(6), type: "topup", categoryId: oyinId, label: "🎮 O'yin-kulgi ochildi", amount: 300 },
    { id: uid(), date: iso(6), type: "topup", categoryId: shirinId, label: "🍬 Shirinlik ochildi", amount: 150 },
    { id: uid(), date: iso(4), type: "expense", categoryId: maktabId, label: "🎓 Maktab — daftar va ruchka", amount: -220 },
    { id: uid(), date: iso(2), type: "expense", categoryId: oyinId, label: "🎮 O'yin-kulgi — o'yin kartasi", amount: -80 },
    { id: uid(), date: iso(1), type: "expense", categoryId: shirinId, label: "🍬 Shirinlik — pechenye", amount: -40 },
    { id: uid(), date: iso(1), type: "borrow", categoryId: transportId, label: "🍬 Shirinlik → 🚌 Transport — avtobus uchun yetmadi", amount: 50 },
    { id: uid(), date: iso(0), type: "expense", categoryId: transportId, label: "🚌 Transport — bir haftalik chipta", amount: -200 },
  ];

  return { categories, debts, transactions, adminPin: null };
}

export default function App() {
  const [data, setData] = useState({ categories: [], debts: [], transactions: [], adminPin: null });
  const [loading, setLoading] = useState(true);
  const [saveError, setSaveError] = useState(false);

  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);
  const [formPin, setFormPin] = useState("");

  const [modal, setModal] = useState(null); // { type, ctx }
  const [formName, setFormName] = useState("");
  const [formEmoji, setFormEmoji] = useState(EMOJIS[0]);
  const [formAmount, setFormAmount] = useState("");
  const [formNote, setFormNote] = useState("");
  const [formCategoryId, setFormCategoryId] = useState("");
  const [formFromId, setFormFromId] = useState("");
  const [formError, setFormError] = useState("");

  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [deleteBlocked, setDeleteBlocked] = useState(null);
  const [showAllTxns, setShowAllTxns] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const [familyCode, setFamilyCode] = useState(null);
  const [syncMeta, setSyncMeta] = useState({ updatedAt: 0, lastSyncAt: null, status: "idle" });
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [syncTab, setSyncTab] = useState("create");
  const [joinCodeInput, setJoinCodeInput] = useState("");
  const [syncError, setSyncError] = useState("");
  const [copiedCode, setCopiedCode] = useState(false);
  const [syncingNow, setSyncingNow] = useState(false);

  const dataRef = React.useRef(data);
  const familyCodeRef = React.useRef(familyCode);
  const syncMetaRef = React.useRef(syncMeta);
  const skipNextPushRef = React.useRef(false);

  useEffect(() => { dataRef.current = data; }, [data]);
  useEffect(() => { familyCodeRef.current = familyCode; }, [familyCode]);
  useEffect(() => { syncMetaRef.current = syncMeta; }, [syncMeta]);

  useEffect(() => {
    (async () => {
      try {
        let code = null;
        let meta = { updatedAt: 0, lastSyncAt: null, status: "idle" };

        try {
          const codeRes = await window.storage.get(FAMILY_CODE_KEY, true);
          if (codeRes && codeRes.value) code = normalizeFamilyCode(codeRes.value);
        } catch {}

        try {
          const metaRes = await window.storage.get(SYNC_META_KEY, true);
          if (metaRes && metaRes.value) meta = { ...meta, ...JSON.parse(metaRes.value) };
        } catch {}

        if (code) {
          setFamilyCode(code);
          setSyncMeta(meta);

          let loaded = null;
          if (firebaseEnabled()) {
            const cloud = await cloudFetchFamily(code);
            if (cloud && cloud.updatedAt) {
              loaded = {
                categories: cloud.categories || [],
                debts: cloud.debts || [],
                transactions: cloud.transactions || [],
                adminPin: cloud.adminPin || null,
              };
              meta = { ...meta, updatedAt: cloud.updatedAt, lastSyncAt: Date.now(), status: "ok" };
              setSyncMeta(meta);
              try {
                await window.storage.set(SYNC_META_KEY, JSON.stringify(meta), true);
                await window.storage.set(familyStorageKey(code), JSON.stringify(loaded), true);
              } catch {}
            }
          }

          if (!loaded) {
            try {
              const localRes = await window.storage.get(familyStorageKey(code), true);
              if (localRes && localRes.value) {
                const parsed = JSON.parse(localRes.value);
                loaded = {
                  categories: parsed.categories || [],
                  debts: parsed.debts || [],
                  transactions: parsed.transactions || [],
                  adminPin: parsed.adminPin || null,
                };
              }
            } catch {}
          }

          if (loaded) {
            setData(loaded);
          } else {
            setData(seedData());
          }
        } else {
          const res = await window.storage.get(STORAGE_KEY, true);
          if (res && res.value) {
            const parsed = JSON.parse(res.value);
            setData({
              categories: parsed.categories || [],
              debts: parsed.debts || [],
              transactions: parsed.transactions || [],
              adminPin: parsed.adminPin || null,
            });
          } else {
            setData(seedData());
          }
          setShowSyncModal(true);
        }
      } catch {
        setData(seedData());
        setShowSyncModal(true);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!familyCode || !firebaseEnabled() || loading) return;

    let cancelled = false;

    async function pullRemote() {
      const code = familyCodeRef.current;
      if (!code) return;
      const remote = await cloudFetchFamily(code);
      if (cancelled || !remote || !remote.updatedAt) return;
      const localUpdatedAt = syncMetaRef.current.updatedAt || 0;
      if (remote.updatedAt <= localUpdatedAt) return;

      skipNextPushRef.current = true;
      const incoming = {
        categories: remote.categories || [],
        debts: remote.debts || [],
        transactions: remote.transactions || [],
        adminPin: remote.adminPin || null,
      };
      setData(incoming);
      const nextMeta = {
        updatedAt: remote.updatedAt,
        lastSyncAt: Date.now(),
        status: "ok",
      };
      setSyncMeta(nextMeta);
      try {
        await window.storage.set(familyStorageKey(code), JSON.stringify(incoming), true);
        await window.storage.set(SYNC_META_KEY, JSON.stringify(nextMeta), true);
      } catch {}
    }

    pullRemote();
    const timer = setInterval(pullRemote, SYNC_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [familyCode, loading]);

  async function saveSyncMeta(meta) {
    setSyncMeta(meta);
    try {
      await window.storage.set(SYNC_META_KEY, JSON.stringify(meta), true);
    } catch {}
  }

  async function saveFamilyCode(code) {
    const normalized = normalizeFamilyCode(code);
    setFamilyCode(normalized);
    try {
      await window.storage.set(FAMILY_CODE_KEY, normalized, true);
    } catch {}
    return normalized;
  }

  async function persist(newData, options = {}) {
    const { skipCloud = false } = options;
    setData(newData);

    const code = familyCodeRef.current;
    const storageKey = code ? familyStorageKey(code) : STORAGE_KEY;
    const updatedAt = Date.now();

    try {
      const res = await window.storage.set(storageKey, JSON.stringify(newData), true);
      setSaveError(!res);
    } catch {
      setSaveError(true);
    }

    if (skipNextPushRef.current) {
      skipNextPushRef.current = false;
      return;
    }

    if (!code || skipCloud || !firebaseEnabled()) return;

    const pushed = await cloudPushFamily(code, newData, updatedAt);
    const nextMeta = {
      updatedAt,
      lastSyncAt: Date.now(),
      status: pushed ? "ok" : "error",
    };
    await saveSyncMeta(nextMeta);
  }

  async function createFamilyRoom() {
    setSyncError("");
    const code = generateFamilyCode();
    await saveFamilyCode(code);
    const updatedAt = Date.now();
    if (firebaseEnabled()) {
      const pushed = await cloudPushFamily(code, dataRef.current, updatedAt);
      if (!pushed) {
        setSyncError("Bulutga yozib bo'lmadi. Internetni tekshiring yoki keyinroq sinab ko'ring.");
      }
      await saveSyncMeta({ updatedAt, lastSyncAt: Date.now(), status: pushed ? "ok" : "error" });
    } else {
      await saveSyncMeta({ updatedAt, lastSyncAt: null, status: "local" });
    }
    try {
      await window.storage.set(familyStorageKey(code), JSON.stringify(dataRef.current), true);
    } catch {}
    setSyncTab("share");
    setShowSyncModal(true);
  }

  async function joinFamilyRoom() {
    setSyncError("");
    const code = normalizeFamilyCode(joinCodeInput);
    if (code.length !== 6) {
      setSyncError("6 belgili kod kiriting (masalan: K7M2XP).");
      return;
    }

    setSyncingNow(true);
    let incoming = null;
    let remoteUpdatedAt = Date.now();

    if (firebaseEnabled()) {
      const remote = await cloudFetchFamily(code);
      if (!remote || !remote.categories) {
        setSyncError("Bu kod topilmadi. Kodingiz to'g'ri ekanini tekshiring yoki avval oila yaratilgan bo'lsin.");
        setSyncingNow(false);
        return;
      }
      incoming = {
        categories: remote.categories || [],
        debts: remote.debts || [],
        transactions: remote.transactions || [],
        adminPin: remote.adminPin || null,
      };
      remoteUpdatedAt = remote.updatedAt || Date.now();
    } else {
      try {
        const localRes = await window.storage.get(familyStorageKey(code), true);
        if (localRes && localRes.value) {
          const parsed = JSON.parse(localRes.value);
          incoming = {
            categories: parsed.categories || [],
            debts: parsed.debts || [],
            transactions: parsed.transactions || [],
            adminPin: parsed.adminPin || null,
          };
        }
      } catch {}
      if (!incoming) {
        setSyncError("Bulut sozlanmagan — bu kod bilan ma'lumot topilmadi. Avval ota-onaning telefonida oila yaratilgan bo'lsin.");
        setSyncingNow(false);
        return;
      }
    }

    skipNextPushRef.current = true;
    setData(incoming);
    await saveFamilyCode(code);
    try {
      await window.storage.set(familyStorageKey(code), JSON.stringify(incoming), true);
    } catch {}
    await saveSyncMeta({
      updatedAt: remoteUpdatedAt,
      lastSyncAt: Date.now(),
      status: firebaseEnabled() ? "ok" : "local",
    });
    setSyncingNow(false);
    setShowSyncModal(false);
  }

  async function manualSyncNow() {
    const code = familyCodeRef.current;
    if (!code || !firebaseEnabled()) return;
    setSyncingNow(true);
    const remote = await cloudFetchFamily(code);
    const localUpdatedAt = syncMetaRef.current.updatedAt || 0;

    if (remote && remote.updatedAt && remote.updatedAt > localUpdatedAt) {
      skipNextPushRef.current = true;
      setData({
        categories: remote.categories || [],
        debts: remote.debts || [],
        transactions: remote.transactions || [],
        adminPin: remote.adminPin || null,
      });
      await saveSyncMeta({ updatedAt: remote.updatedAt, lastSyncAt: Date.now(), status: "ok" });
    } else {
      const updatedAt = Date.now();
      const pushed = await cloudPushFamily(code, dataRef.current, updatedAt);
      await saveSyncMeta({
        updatedAt,
        lastSyncAt: Date.now(),
        status: pushed ? "ok" : "error",
      });
    }
    setSyncingNow(false);
  }

  async function copyFamilyCode() {
    if (!familyCode) return;
    try {
      await navigator.clipboard.writeText(familyCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      setSyncError("Nusxa olish muvaffaqiyatsiz. Kodni qo'lda tanlab nusxalang.");
    }
  }

  function formatSyncTime(ts) {
    if (!ts) return "hali yo'q";
    try {
      return new Date(ts).toLocaleTimeString("uz-UZ", { hour: "2-digit", minute: "2-digit" });
    } catch {
      return "";
    }
  }

  function requireAdmin(action) {
    if (adminUnlocked) { action(); return; }
    setPendingAction(() => action);
    setFormPin("");
    setFormError("");
    setModal({ type: "pin", ctx: { setup: !data.adminPin } });
  }

  function submitPin() {
    if (modal.ctx.setup) {
      if (formPin.trim().length < 3) { setFormError("Kamida 3 belgidan iborat kod kiriting."); return; }
      persist({ ...data, adminPin: formPin.trim() });
      setAdminUnlocked(true);
      const action = pendingAction;
      setPendingAction(null);
      setModal(null);
      if (action) action();
      return;
    }
    if (formPin.trim() !== data.adminPin) { setFormError("Kod noto'g'ri."); return; }
    setAdminUnlocked(true);
    const action = pendingAction;
    setPendingAction(null);
    setModal(null);
    if (action) action();
  }

  const remainingOf = (cat) => (cat ? cat.budget - cat.spent : 0);
  const findCat = (id) => data.categories.find((c) => c.id === id);

  const totals = useMemo(() => {
    const budget = data.categories.reduce((s, c) => s + c.budget, 0);
    const spent = data.categories.reduce((s, c) => s + c.spent, 0);
    return { budget, spent, remaining: budget - spent };
  }, [data.categories]);

  function debtsFor(catId) {
    return {
      owes: data.debts.filter((d) => d.borrowerId === catId),
      owed: data.debts.filter((d) => d.lenderId === catId),
    };
  }

  function openModal(type, ctx = {}) {
    setFormError("");
    setFormPin("");
    setFormName("");
    setFormEmoji(EMOJIS[data.categories.length % EMOJIS.length]);
    setFormAmount("");
    setFormNote("");
    setFormCategoryId(ctx.categoryId || (data.categories[0] && data.categories[0].id) || "");
    const others = data.categories.filter((c) => c.id !== (ctx.categoryId || ""));
    setFormFromId(others[0] ? others[0].id : "");
    setModal({ type, ctx });
  }

  function closeModal() {
    setModal(null);
    setFormError("");
  }

  function submitCategory() {
    const name = formName.trim();
    const budget = Number(formAmount);
    if (!name) { setFormError("Toifa nomini kiriting."); return; }
    if (!budget || budget <= 0) { setFormError("To'g'ri summa kiriting."); return; }
    const newCat = { id: uid(), name, emoji: formEmoji, budget, spent: 0 };
    const txn = {
      id: uid(), date: nowISO(), type: "topup", categoryId: newCat.id,
      label: `${newCat.emoji} ${newCat.name} ochildi`, amount: budget,
    };
    persist({ ...data, categories: [...data.categories, newCat], transactions: [txn, ...data.transactions] });
    closeModal();
  }

  function submitExpense() {
    const cat = findCat(formCategoryId);
    const amount = Number(formAmount);
    if (!cat) { setFormError("Toifani tanlang."); return; }
    if (!amount || amount <= 0) { setFormError("To'g'ri summa kiriting."); return; }
    if (amount > remainingOf(cat)) {
      setFormError(`Yetarli mablag' yo'q. Qoldiq: ${formatMoney(remainingOf(cat))}.`);
      return;
    }
    const categories = data.categories.map((c) => (c.id === cat.id ? { ...c, spent: c.spent + amount } : c));
    const txn = {
      id: uid(), date: nowISO(), type: "expense", categoryId: cat.id,
      label: `${cat.emoji} ${cat.name}${formNote.trim() ? " — " + formNote.trim() : ""}`, amount: -amount,
    };
    persist({ ...data, categories, transactions: [txn, ...data.transactions] });
    closeModal();
  }

  function submitTopup() {
    const cat = findCat(formCategoryId);
    const amount = Number(formAmount);
    if (!cat) { setFormError("Toifani tanlang."); return; }
    if (!amount || amount <= 0) { setFormError("To'g'ri summa kiriting."); return; }
    const categories = data.categories.map((c) => (c.id === cat.id ? { ...c, budget: c.budget + amount } : c));
    const txn = {
      id: uid(), date: nowISO(), type: "topup", categoryId: cat.id,
      label: `${cat.emoji} ${cat.name}${formNote.trim() ? " — " + formNote.trim() : ""}`, amount,
    };
    persist({ ...data, categories, transactions: [txn, ...data.transactions] });
    closeModal();
  }

  function submitBorrow() {
    const to = findCat(formCategoryId);
    const from = findCat(formFromId);
    const amount = Number(formAmount);
    if (!to || !from) { setFormError("Toifalarni tanlang."); return; }
    if (to.id === from.id) { setFormError("Bir xil toifadan qarz olib bo'lmaydi."); return; }
    if (!amount || amount <= 0) { setFormError("To'g'ri summa kiriting."); return; }
    if (amount > remainingOf(from)) {
      setFormError(`${from.name}da yetarli mablag' yo'q. Qoldiq: ${formatMoney(remainingOf(from))}.`);
      return;
    }
    const categories = data.categories.map((c) => {
      if (c.id === from.id) return { ...c, budget: c.budget - amount };
      if (c.id === to.id) return { ...c, budget: c.budget + amount };
      return c;
    });
    const existing = data.debts.find((d) => d.lenderId === from.id && d.borrowerId === to.id);
    const debts = existing
      ? data.debts.map((d) => (d.id === existing.id ? { ...d, amount: d.amount + amount } : d))
      : [...data.debts, { id: uid(), lenderId: from.id, borrowerId: to.id, amount, date: nowISO() }];
    const txn = {
      id: uid(), date: nowISO(), type: "borrow", categoryId: to.id,
      label: `${from.emoji} ${from.name} → ${to.emoji} ${to.name}${formNote.trim() ? " — " + formNote.trim() : ""}`,
      amount,
    };
    persist({ ...data, categories, debts, transactions: [txn, ...data.transactions] });
    closeModal();
  }

  function submitRepay() {
    const debt = data.debts.find((d) => d.id === modal.ctx.debtId);
    if (!debt) { closeModal(); return; }
    const borrower = findCat(debt.borrowerId);
    const lender = findCat(debt.lenderId);
    const amount = Number(formAmount);
    const maxAllowed = Math.min(debt.amount, remainingOf(borrower));
    if (!amount || amount <= 0) { setFormError("To'g'ri summa kiriting."); return; }
    if (amount > maxAllowed + 0.0001) {
      setFormError(`Eng ko'pi bilan ${formatMoney(maxAllowed)} qaytarish mumkin.`);
      return;
    }
    const categories = data.categories.map((c) => {
      if (c.id === borrower.id) return { ...c, budget: c.budget - amount };
      if (c.id === lender.id) return { ...c, budget: c.budget + amount };
      return c;
    });
    const remainingDebt = debt.amount - amount;
    const debts = remainingDebt <= 0.0001
      ? data.debts.filter((d) => d.id !== debt.id)
      : data.debts.map((d) => (d.id === debt.id ? { ...d, amount: remainingDebt } : d));
    const txn = {
      id: uid(), date: nowISO(), type: "repay", categoryId: borrower.id,
      label: `${borrower.emoji} ${borrower.name} → ${lender.emoji} ${lender.name} (qarz qaytarildi)`, amount,
    };
    persist({ ...data, categories, debts, transactions: [txn, ...data.transactions] });
    closeModal();
  }

  function handleDeleteClick(catId) {
    const { owes, owed } = debtsFor(catId);
    if (owes.length || owed.length) {
      setDeleteBlocked(catId);
      setConfirmDeleteId(null);
      setTimeout(() => setDeleteBlocked((cur) => (cur === catId ? null : cur)), 3000);
      return;
    }
    setConfirmDeleteId(catId);
  }

  function confirmDelete(catId) {
    persist({ ...data, categories: data.categories.filter((c) => c.id !== catId) });
    setConfirmDeleteId(null);
  }

  async function resetAll() {
    try {
      await window.storage.delete(STORAGE_KEY, true);
      if (familyCode) await window.storage.delete(familyStorageKey(familyCode), true);
      await window.storage.delete(FAMILY_CODE_KEY, true);
      await window.storage.delete(SYNC_META_KEY, true);
    } catch {}
    setData({ categories: [], debts: [], transactions: [], adminPin: null });
    setFamilyCode(null);
    setSyncMeta({ updatedAt: 0, lastSyncAt: null, status: "idle" });
    setAdminUnlocked(false);
    setConfirmReset(false);
    setShowSyncModal(true);
  }

  const displayedTxns = showAllTxns ? data.transactions : data.transactions.slice(0, 6);

  return (
    <div className="pl-app">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,500;0,600;1,500;1,600&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
        .pl-app, .pl-app * { box-sizing: border-box; }
        .pl-app {
          --bg:#0F1B1E; --bg-alt:#16262A; --surface:#1C2C30;
          --paper:#E8DFC8; --paper-shadow:#C9BB98;
          --ink:#241C12; --ink-soft:#5B5040;
          --text:#EDE6D6; --text-muted:#93A6A3;
          --brass:#C9A24B; --brass-dark:#9C7A33;
          --teal:#4E8C82; --teal-dark:#386B62; --teal-light:#7FC4B8;
          --rust:#B5533C; --rust-dark:#8F3F2D; --rust-light:#E08669;
          --line: rgba(237,230,214,0.12);
          font-family:'Inter',sans-serif;
          background: radial-gradient(ellipse at top, var(--bg-alt) 0%, var(--bg) 65%);
          color: var(--text);
          min-height: 100vh;
          padding: 40px 20px 60px;
        }
        .pl-shell { max-width: 1100px; margin: 0 auto; }
        .pl-header { display:flex; justify-content:space-between; align-items:flex-end; gap:20px; flex-wrap:wrap; border-bottom:1px solid var(--line); padding-bottom:26px; margin-bottom:32px; }
        .pl-eyebrow { display:flex; align-items:center; gap:7px; font-family:'IBM Plex Mono',monospace; font-size:11px; letter-spacing:.18em; text-transform:uppercase; color:var(--brass); margin:0 0 10px; }
        .pl-title { font-family:'Fraunces',serif; font-style:italic; font-weight:600; font-size:clamp(28px,4vw,42px); margin:0; }
        .pl-subtitle { font-size:14px; color:var(--text-muted); margin-top:8px; max-width:480px; line-height:1.5; }
        .pl-add-btn { display:flex; align-items:center; gap:6px; background:var(--brass); color:#20170A; border:none; padding:11px 18px; border-radius:24px; font-weight:600; font-size:14px; cursor:pointer; transition:background .15s, transform .15s; white-space:nowrap; }
        .pl-add-btn:hover { background:#DDB85E; transform:translateY(-1px); }
        .pl-lock-btn { display:flex; align-items:center; justify-content:center; width:42px; border:1px solid var(--line); background:var(--surface); color:var(--text-muted); border-radius:24px; cursor:pointer; transition:color .15s, border-color .15s; }
        .pl-lock-btn:hover { color:var(--brass); border-color:var(--brass); }
        .pl-sync-btn { display:flex; align-items:center; gap:6px; border:1px solid var(--line); background:var(--surface); color:var(--text-muted); padding:8px 12px; border-radius:24px; font-size:12.5px; font-weight:600; cursor:pointer; transition:color .15s, border-color .15s; white-space:nowrap; }
        .pl-sync-btn:hover { color:var(--teal-light); border-color:var(--teal); }
        .pl-sync-btn.connected { color:var(--teal-light); border-color:rgba(127,196,184,.45); }
        .pl-sync-pill { display:inline-flex; align-items:center; gap:8px; margin-bottom:18px; padding:8px 12px; border-radius:12px; background:rgba(78,140,130,.14); border:1px solid rgba(127,196,184,.28); font-size:12.5px; color:var(--teal-light); flex-wrap:wrap; }
        .pl-family-code { font-family:'IBM Plex Mono',monospace; font-size:18px; font-weight:600; letter-spacing:.18em; color:var(--brass); }
        .pl-copy-btn { display:inline-flex; align-items:center; gap:4px; border:1px solid rgba(201,162,75,.35); background:rgba(201,162,75,.12); color:var(--brass); padding:4px 8px; border-radius:14px; font-size:11px; font-weight:600; cursor:pointer; }
        .pl-sync-tabs { display:flex; gap:8px; margin-bottom:16px; }
        .pl-sync-tab { flex:1; border:1px solid rgba(36,28,18,.18); background:transparent; color:var(--ink-soft); padding:8px 10px; border-radius:12px; font-size:12.5px; font-weight:600; cursor:pointer; }
        .pl-sync-tab.active { background:var(--ink); color:var(--paper); border-color:var(--ink); }
        .pl-sync-status { font-size:11.5px; color:var(--text-muted); margin-top:6px; }

        .pl-summary { display:flex; border:1px solid var(--line); border-radius:16px; overflow:hidden; background:var(--surface); margin-bottom:40px; }
        .pl-summary-item { flex:1; padding:18px 24px; border-right:1px solid var(--line); }
        .pl-summary-item:last-child { border-right:none; }
        .pl-summary-label { font-family:'IBM Plex Mono',monospace; font-size:10px; letter-spacing:.14em; text-transform:uppercase; color:var(--text-muted); }
        .pl-summary-value { font-family:'IBM Plex Mono',monospace; font-size:clamp(18px,2.4vw,26px); font-weight:600; margin-top:6px; }

        .pl-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(250px,1fr)); gap:22px; margin-bottom:44px; }
        .pl-envelope { position:relative; border-radius:0 0 14px 14px; background:var(--paper); color:var(--ink); padding-top:36px; box-shadow:0 6px 16px rgba(0,0,0,.28); transition:transform .2s ease, box-shadow .2s ease; }
        .pl-envelope:hover { transform:translateY(-4px); box-shadow:0 14px 28px rgba(0,0,0,.4); }
        .pl-flap { position:absolute; top:0; left:0; right:0; height:38px; background:linear-gradient(135deg,var(--paper-shadow),var(--paper)); clip-path:polygon(0 0,50% 78%,100% 0); border-radius:14px 14px 0 0; }
        .pl-del-btn { position:absolute; top:44px; left:12px; opacity:0; transition:opacity .15s; background:none; border:none; color:var(--rust-dark); cursor:pointer; z-index:3; padding:2px; }
        .pl-envelope:hover .pl-del-btn { opacity:.7; }
        .pl-del-btn:hover { opacity:1 !important; }
        .pl-stamp-wrap { position:absolute; top:8px; right:10px; display:flex; flex-direction:column; gap:4px; align-items:flex-end; z-index:2; }
        .pl-stamp { transform:rotate(-8deg); border:2px solid var(--rust-dark); color:var(--rust-dark); font-family:'IBM Plex Mono',monospace; font-size:8.5px; font-weight:600; letter-spacing:.06em; text-transform:uppercase; padding:2px 6px; border-radius:4px; background:rgba(181,83,60,.08); }
        .pl-stamp.owed { border-color:var(--brass-dark); color:var(--brass-dark); background:rgba(201,162,75,.12); }
        .pl-envelope-body { padding:16px 18px 18px; }
        .pl-envelope-top { display:flex; align-items:center; gap:8px; margin-bottom:12px; }
        .pl-emoji-big { font-size:22px; line-height:1; }
        .pl-envelope-name { font-family:'Fraunces',serif; font-weight:600; font-size:17px; margin:0; }
        .pl-amt-row { display:flex; justify-content:space-between; font-size:12.5px; color:var(--ink-soft); padding:3px 0; }
        .pl-amt-row .mono { font-family:'IBM Plex Mono',monospace; color:var(--ink); font-weight:500; }
        .pl-bar-track { height:6px; border-radius:3px; background:rgba(36,28,18,.12); overflow:hidden; margin-top:10px; }
        .pl-bar-fill { height:100%; border-radius:3px; transition:width .6s ease; }
        .pl-remaining { font-family:'IBM Plex Mono',monospace; font-size:13px; font-weight:600; margin-top:8px; }
        .pl-card-actions { display:flex; gap:6px; margin-top:14px; flex-wrap:wrap; }
        .pl-pill-btn { display:flex; align-items:center; gap:4px; font-size:11.5px; font-weight:600; padding:6px 9px; border-radius:20px; border:1px solid rgba(36,28,18,.2); background:transparent; color:var(--ink); cursor:pointer; transition:background .15s, color .15s; }
        .pl-pill-btn:hover { background:var(--ink); color:var(--paper); }
        .pl-inline-confirm { margin-top:12px; padding-top:10px; border-top:1px dashed rgba(36,28,18,.2); font-size:12px; display:flex; align-items:center; justify-content:space-between; gap:8px; }
        .pl-inline-confirm button { border:none; background:none; font-weight:700; font-size:12px; cursor:pointer; }
        .pl-inline-confirm .yes { color:var(--rust-dark); }
        .pl-inline-confirm .no { color:var(--ink-soft); }
        .pl-blocked-msg { margin-top:12px; padding-top:10px; border-top:1px dashed rgba(36,28,18,.2); font-size:11.5px; color:var(--rust-dark); display:flex; gap:6px; align-items:flex-start; }

        .pl-empty { border:1px dashed var(--line); border-radius:16px; padding:40px 24px; text-align:center; color:var(--text-muted); margin-bottom:44px; }
        .pl-empty p { margin:0 0 16px; font-size:14px; }

        .pl-section { background:var(--surface); border:1px solid var(--line); border-radius:16px; padding:22px 24px; margin-bottom:28px; }
        .pl-section-head { display:flex; justify-content:space-between; align-items:baseline; gap:10px; margin-bottom:16px; }
        .pl-section-title { font-family:'Fraunces',serif; font-style:italic; font-size:19px; margin:0; }
        .pl-section-sub { font-family:'IBM Plex Mono',monospace; font-size:9.5px; letter-spacing:.14em; text-transform:uppercase; color:var(--text-muted); margin:2px 0 0; }
        .pl-toggle-btn { display:flex; align-items:center; gap:4px; background:none; border:none; color:var(--text-muted); font-size:12px; cursor:pointer; }

        .pl-debt-row { display:flex; align-items:center; gap:10px; padding:11px 0; border-bottom:1px dashed var(--line); font-size:13.5px; }
        .pl-debt-row:last-child { border-bottom:none; }
        .pl-debt-leader { flex:1; border-bottom:1px dotted var(--text-muted); opacity:.35; margin:0 6px; height:0; }
        .pl-debt-amount { font-family:'IBM Plex Mono',monospace; font-weight:600; color:var(--brass); white-space:nowrap; }
        .pl-repay-btn { display:flex; align-items:center; gap:4px; background:none; border:1px solid var(--brass); color:var(--brass); font-size:11.5px; font-weight:600; padding:5px 10px; border-radius:16px; cursor:pointer; white-space:nowrap; }
        .pl-repay-btn:hover { background:var(--brass); color:#20170A; }
        .pl-muted-note { color:var(--text-muted); font-size:13px; }

        .pl-txn-row { display:flex; align-items:center; gap:10px; padding:9px 0; border-bottom:1px dashed var(--line); font-family:'IBM Plex Mono',monospace; font-size:12px; }
        .pl-txn-row:last-child { border-bottom:none; }
        .pl-txn-date { color:var(--text-muted); flex-shrink:0; width:44px; }
        .pl-txn-label { flex:1; color:var(--text); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .pl-txn-amount { font-weight:600; white-space:nowrap; }
        .pl-txn-amount.positive { color:var(--teal-light); }
        .pl-txn-amount.negative { color:var(--rust-light); }
        .pl-txn-amount.neutral { color:var(--brass); }

        .pl-footer { text-align:center; margin-top:36px; }
        .pl-reset-link { background:none; border:none; color:var(--text-muted); font-size:12px; text-decoration:underline; cursor:pointer; }
        .pl-reset-confirm { display:inline-flex; gap:10px; align-items:center; font-size:12px; color:var(--rust-light); }
        .pl-reset-confirm button { border:none; background:none; font-weight:700; cursor:pointer; font-size:12px; }
        .pl-save-warn { text-align:center; font-size:11.5px; color:var(--rust-light); margin-bottom:16px; }

        .pl-overlay { position:fixed; inset:0; background:rgba(6,10,11,.62); backdrop-filter:blur(2px); display:flex; align-items:center; justify-content:center; padding:20px; z-index:50; animation:pl-fade .18s ease; }
        .pl-modal { background:var(--paper); color:var(--ink); border-radius:18px; padding:26px 26px 22px; max-width:400px; width:100%; box-shadow:0 20px 50px rgba(0,0,0,.45); animation:pl-pop .2s ease; }
        @keyframes pl-fade { from{opacity:0} to{opacity:1} }
        @keyframes pl-pop { from{opacity:0; transform:scale(.95) translateY(6px)} to{opacity:1; transform:scale(1) translateY(0)} }
        .pl-modal-head { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:18px; }
        .pl-modal-title { font-family:'Fraunces',serif; font-style:italic; font-weight:600; font-size:20px; margin:0; }
        .pl-modal-close { background:none; border:none; color:var(--ink-soft); cursor:pointer; padding:2px; }
        .pl-field { margin-bottom:16px; }
        .pl-field label { display:block; font-family:'IBM Plex Mono',monospace; font-size:10px; letter-spacing:.1em; text-transform:uppercase; color:var(--ink-soft); margin-bottom:6px; }
        .pl-input, .pl-select { width:100%; border:none; border-bottom:1.5px solid rgba(36,28,18,.3); background:transparent; font-family:'Inter',sans-serif; font-size:15px; padding:7px 2px; color:var(--ink); outline:none; transition:border-color .15s; }
        .pl-input:focus, .pl-select:focus { border-color:var(--ink); }
        input.pl-input[type="number"] { font-family:'IBM Plex Mono',monospace; }
        .pl-hint { font-size:11.5px; color:var(--ink-soft); margin-top:5px; }
        .pl-emoji-row { display:flex; flex-wrap:wrap; gap:6px; }
        .pl-emoji-swatch { width:32px; height:32px; border-radius:8px; border:1.5px solid transparent; background:rgba(36,28,18,.05); font-size:16px; display:flex; align-items:center; justify-content:center; cursor:pointer; }
        .pl-emoji-swatch.selected { border-color:var(--brass-dark); background:rgba(201,162,75,.2); }
        .pl-warn { display:flex; gap:8px; align-items:flex-start; background:rgba(181,83,60,.1); border:1px solid rgba(181,83,60,.3); color:var(--rust-dark); padding:10px 12px; border-radius:10px; font-size:12.5px; margin-bottom:14px; }
        .pl-modal-actions { display:flex; justify-content:flex-end; gap:10px; margin-top:20px; }
        .pl-btn-primary { background:var(--ink); color:var(--paper); border:none; padding:9px 18px; border-radius:22px; font-weight:600; font-size:13.5px; cursor:pointer; }
        .pl-btn-primary:hover { background:#3A2E1C; }
        .pl-btn-ghost { background:none; border:none; color:var(--ink-soft); font-size:13.5px; cursor:pointer; padding:9px 6px; }

        button:focus-visible, .pl-input:focus-visible, .pl-select:focus-visible { outline:2px solid var(--brass); outline-offset:2px; }

        @media (max-width:640px) {
          .pl-summary { flex-direction:column; }
          .pl-summary-item { border-right:none; border-bottom:1px solid var(--line); }
          .pl-summary-item:last-child { border-bottom:none; }
        }
        @media (prefers-reduced-motion: reduce) {
          .pl-envelope, .pl-bar-fill, .pl-overlay, .pl-modal, .pl-add-btn { transition:none !important; animation:none !important; }
        }
        @keyframes pl-spin { to { transform: rotate(360deg); } }
        .pl-spin { animation: pl-spin .8s linear infinite; }
      `}</style>

      <div className="pl-shell">
        <div className="pl-header">
          <div>
            <p className="pl-eyebrow"><BookOpen size={13} /> Cho'ntak boshqaruvi</p>
            <h1 className="pl-title">Cho'ntak daftari</h1>
            <p className="pl-subtitle">
              Ukangga qancha va nima uchun pul berilganini kuzatib boring. Bir toifaga yetmasa,
              boshqasidan qarz sifatida ko'chiring — hammasi bu yerda qayd qilib boriladi.
            </p>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
            {familyCode && (
              <button
                className={`pl-sync-btn ${syncMeta.status === "ok" ? "connected" : ""}`}
                title="Oila kodi va sinxronizatsiya"
                onClick={() => { setSyncError(""); setShowSyncModal(true); setSyncTab("share"); }}
              >
                <Users size={14} />
                {familyCode}
              </button>
            )}
            {!familyCode && (
              <button
                className="pl-sync-btn"
                title="Ukang bilan ulashish"
                onClick={() => { setSyncError(""); setShowSyncModal(true); }}
              >
                <Link2 size={14} /> Ulanish
              </button>
            )}
            {familyCode && firebaseEnabled() && (
              <button
                className="pl-lock-btn"
                title="Hozir sinxronlash"
                onClick={manualSyncNow}
                disabled={syncingNow}
              >
                <RefreshCw size={16} className={syncingNow ? "pl-spin" : ""} />
              </button>
            )}
            <button
              className="pl-lock-btn"
              title={adminUnlocked ? "Administrator rejimi ochiq — bosib qulflang" : "Faqat siz uchun: to'ldirish va qarz berishni boshqarish"}
              onClick={() => (adminUnlocked ? setAdminUnlocked(false) : requireAdmin(() => {}))}
            >
              {adminUnlocked ? <Unlock size={16} /> : <Lock size={16} />}
            </button>
            <button className="pl-add-btn" onClick={() => requireAdmin(() => openModal("category"))}>
              <Plus size={16} /> Yangi toifa
            </button>
          </div>
        </div>

        {loading ? (
          <div className="pl-empty"><p>Yuklanmoqda…</p></div>
        ) : (
          <>
            {saveError && <p className="pl-save-warn">Saqlashda muammo yuz berdi. O'zgarishlar vaqtincha faqat shu sahifada.</p>}

            <div className="pl-summary">
              <div className="pl-summary-item">
                <div className="pl-summary-label">Jami byudjet</div>
                <div className="pl-summary-value">{formatMoney(totals.budget)}</div>
              </div>
              <div className="pl-summary-item">
                <div className="pl-summary-label">Sarflangan</div>
                <div className="pl-summary-value" style={{ color: "var(--rust-light)" }}>{formatMoney(totals.spent)}</div>
              </div>
              <div className="pl-summary-item">
                <div className="pl-summary-label">Qoldiq</div>
                <div className="pl-summary-value" style={{ color: "var(--teal-light)" }}>{formatMoney(totals.remaining)}</div>
              </div>
            </div>

            {data.categories.length === 0 ? (
              <div className="pl-empty">
                <p>Hali toifalar yo'q. Birinchi cho'ntakni oching — masalan, "Maktab" yoki "Transport".</p>
                <button className="pl-add-btn" style={{ margin: "0 auto" }} onClick={() => requireAdmin(() => openModal("category"))}>
                  <Plus size={16} /> Yangi toifa
                </button>
              </div>
            ) : (
              <div className="pl-grid">
                {data.categories.map((cat) => {
                  const remaining = remainingOf(cat);
                  const ratio = cat.budget > 0 ? cat.spent / cat.budget : 0;
                  const barColor = ratio >= 1 ? "var(--rust)" : ratio >= 0.75 ? "var(--brass)" : "var(--teal)";
                  const { owes, owed } = debtsFor(cat.id);
                  const owesTotal = owes.reduce((s, d) => s + d.amount, 0);
                  const owedTotal = owed.reduce((s, d) => s + d.amount, 0);
                  return (
                    <div className="pl-envelope" key={cat.id}>
                      <div className="pl-flap" />
                      <div className="pl-stamp-wrap">
                        {owesTotal > 0 && <span className="pl-stamp">Qarzdor · {formatMoney(owesTotal)}</span>}
                        {owedTotal > 0 && <span className="pl-stamp owed">Sizga qarz · {formatMoney(owedTotal)}</span>}
                      </div>
                      <button className="pl-del-btn" onClick={() => requireAdmin(() => handleDeleteClick(cat.id))} title="O'chirish">
                        <Trash2 size={14} />
                      </button>
                      <div className="pl-envelope-body">
                        <div className="pl-envelope-top">
                          <span className="pl-emoji-big">{cat.emoji}</span>
                          <h3 className="pl-envelope-name">{cat.name}</h3>
                        </div>
                        <div className="pl-amt-row"><span>Byudjet</span><span className="mono">{formatMoney(cat.budget)}</span></div>
                        <div className="pl-amt-row"><span>Sarflangan</span><span className="mono">{formatMoney(cat.spent)}</span></div>
                        <div className="pl-bar-track"><div className="pl-bar-fill" style={{ width: `${Math.min(ratio * 100, 100)}%`, background: barColor }} /></div>
                        <div className="pl-remaining" style={{ color: barColor }}>{formatMoney(remaining)} qoldi</div>
                        <div className="pl-card-actions">
                          <button className="pl-pill-btn" onClick={() => openModal("expense", { categoryId: cat.id })}><Receipt size={12} /> Xarajat</button>
                          <button className="pl-pill-btn" onClick={() => requireAdmin(() => openModal("topup", { categoryId: cat.id }))}><Coins size={12} /> To'ldirish</button>
                          <button className="pl-pill-btn" onClick={() => requireAdmin(() => openModal("borrow", { categoryId: cat.id }))}><ArrowLeftRight size={12} /> Qarz</button>
                        </div>
                        {confirmDeleteId === cat.id && (
                          <div className="pl-inline-confirm">
                            <span>O'chirilsinmi?</span>
                            <span>
                              <button className="yes" onClick={() => confirmDelete(cat.id)}>Ha</button>
                              {" · "}
                              <button className="no" onClick={() => setConfirmDeleteId(null)}>Yo'q</button>
                            </span>
                          </div>
                        )}
                        {deleteBlocked === cat.id && (
                          <div className="pl-blocked-msg"><AlertTriangle size={13} /> Bu toifada faol qarz bor — avval uni yoping.</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="pl-section">
              <div className="pl-section-head">
                <div>
                  <p className="pl-section-title">Qarzlar daftari</p>
                  <p className="pl-section-sub">Kim kimga qarzdor</p>
                </div>
              </div>
              {data.debts.length === 0 ? (
                <p className="pl-muted-note">Hozircha qarzlar yo'q — barcha toifalar o'z holida.</p>
              ) : (
                data.debts.map((d) => {
                  const lender = findCat(d.lenderId);
                  const borrower = findCat(d.borrowerId);
                  if (!lender || !borrower) return null;
                  return (
                    <div className="pl-debt-row" key={d.id}>
                      <span>{borrower.emoji} {borrower.name}</span>
                      <span className="pl-debt-leader" />
                      <span>{lender.emoji} {lender.name}</span>
                      <span className="pl-debt-amount">{formatMoney(d.amount)}</span>
                      <button className="pl-repay-btn" onClick={() => requireAdmin(() => openModal("repay", { debtId: d.id }))}>
                        <Undo2 size={12} /> To'lash
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            <div className="pl-section">
              <div className="pl-section-head">
                <div>
                  <p className="pl-section-title">So'nggi harakatlar</p>
                  <p className="pl-section-sub">Tranzaksiyalar tarixi</p>
                </div>
                {data.transactions.length > 6 && (
                  <button className="pl-toggle-btn" onClick={() => setShowAllTxns((v) => !v)}>
                    {showAllTxns ? "Kamroq" : "Barchasini ko'rish"}
                    {showAllTxns ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                )}
              </div>
              {data.transactions.length === 0 ? (
                <p className="pl-muted-note">Hali hech qanday harakat yo'q.</p>
              ) : (
                displayedTxns.map((t) => {
                  const cls = t.type === "expense" ? "negative" : t.type === "topup" ? "positive" : "neutral";
                  const prefix = cls === "positive" ? "+" : cls === "negative" ? "-" : "⇄ ";
                  const shown = cls === "neutral" ? formatMoney(t.amount) : formatMoney(Math.abs(t.amount));
                  return (
                    <div className="pl-txn-row" key={t.id}>
                      <span className="pl-txn-date">{formatDate(t.date)}</span>
                      <span className="pl-txn-label">{t.label}</span>
                      <span className={`pl-txn-amount ${cls}`}>{cls === "neutral" ? prefix : prefix}{shown}</span>
                    </div>
                  );
                })
              )}
            </div>

            <div className="pl-footer">
              {confirmReset ? (
                <span className="pl-reset-confirm">
                  Barcha ma'lumot o'chirilsinmi?
                  <button onClick={resetAll}>Ha, tozalash</button>
                  <button onClick={() => setConfirmReset(false)}>Bekor qilish</button>
                </span>
              ) : (
                <button className="pl-reset-link" onClick={() => requireAdmin(() => setConfirmReset(true))}>Ma'lumotlarni tozalash</button>
              )}
            </div>
          </>
        )}
      </div>

      {modal && (
        <div className="pl-overlay" onClick={closeModal}>
          <div className="pl-modal" onClick={(e) => e.stopPropagation()}>
            {modal.type === "pin" && (
              <>
                <div className="pl-modal-head">
                  <h2 className="pl-modal-title">{modal.ctx.setup ? "Kod o'rnating" : "Administrator kodi"}</h2>
                  <button className="pl-modal-close" onClick={() => { setPendingAction(null); closeModal(); }}><X size={18} /></button>
                </div>
                {formError && <div className="pl-warn"><AlertTriangle size={14} /> {formError}</div>}
                <p className="pl-hint" style={{ marginBottom: 14 }}>
                  {modal.ctx.setup
                    ? "To'ldirish, qarz berish va toifalarni boshqarish faqat shu kod bilan ochiladi. Kodni faqat o'zingiz biling."
                    : "Byudjetni to'ldirish yoki qarz berish uchun kodni kiriting."}
                </p>
                <div className="pl-field">
                  <label>Kod</label>
                  <input
                    className="pl-input"
                    type="password"
                    inputMode="numeric"
                    value={formPin}
                    onChange={(e) => setFormPin(e.target.value)}
                    placeholder="••••"
                    autoFocus
                    onKeyDown={(e) => e.key === "Enter" && submitPin()}
                  />
                </div>
                <div className="pl-modal-actions">
                  <button className="pl-btn-ghost" onClick={() => { setPendingAction(null); closeModal(); }}>Bekor qilish</button>
                  <button className="pl-btn-primary" onClick={submitPin}>{modal.ctx.setup ? "Saqlash" : "Ochish"}</button>
                </div>
              </>
            )}

            {modal.type === "category" && (
              <>
                <div className="pl-modal-head">
                  <h2 className="pl-modal-title">Yangi toifa</h2>
                  <button className="pl-modal-close" onClick={closeModal}><X size={18} /></button>
                </div>
                {formError && <div className="pl-warn"><AlertTriangle size={14} /> {formError}</div>}
                <div className="pl-field">
                  <label>Nomi</label>
                  <input className="pl-input" value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="Masalan: Maktab" />
                </div>
                <div className="pl-field">
                  <label>Boshlang'ich byudjet</label>
                  <input className="pl-input" type="number" min="0" value={formAmount} onChange={(e) => setFormAmount(e.target.value)} placeholder="1000" onKeyDown={(e) => e.key === "Enter" && submitCategory()} />
                </div>
                <div className="pl-field">
                  <label>Belgi</label>
                  <div className="pl-emoji-row">
                    {EMOJIS.map((em) => (
                      <div key={em} className={`pl-emoji-swatch ${formEmoji === em ? "selected" : ""}`} onClick={() => setFormEmoji(em)}>{em}</div>
                    ))}
                  </div>
                </div>
                <div className="pl-modal-actions">
                  <button className="pl-btn-ghost" onClick={closeModal}>Bekor qilish</button>
                  <button className="pl-btn-primary" onClick={submitCategory}>Qo'shish</button>
                </div>
              </>
            )}

            {modal.type === "expense" && (
              <>
                <div className="pl-modal-head">
                  <h2 className="pl-modal-title">Xarajat qo'shish</h2>
                  <button className="pl-modal-close" onClick={closeModal}><X size={18} /></button>
                </div>
                {formError && (
                  <div className="pl-warn">
                    <AlertTriangle size={14} />
                    <span>
                      {formError}{" "}
                      <button style={{ background: "none", border: "none", textDecoration: "underline", color: "var(--rust-dark)", fontWeight: 600, cursor: "pointer", padding: 0, font: "inherit" }} onClick={() => requireAdmin(() => openModal("borrow", { categoryId: formCategoryId }))}>
                        Boshqa toifadan qarz olish
                      </button>
                    </span>
                  </div>
                )}
                <div className="pl-field">
                  <label>Toifa</label>
                  <select className="pl-select" value={formCategoryId} onChange={(e) => setFormCategoryId(e.target.value)}>
                    {data.categories.map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.name} — qoldiq {formatMoney(remainingOf(c))}</option>)}
                  </select>
                </div>
                <div className="pl-field">
                  <label>Summasi</label>
                  <input className="pl-input" type="number" min="0" value={formAmount} onChange={(e) => setFormAmount(e.target.value)} placeholder="0" onKeyDown={(e) => e.key === "Enter" && submitExpense()} />
                </div>
                <div className="pl-field">
                  <label>Izoh (ixtiyoriy)</label>
                  <input className="pl-input" value={formNote} onChange={(e) => setFormNote(e.target.value)} placeholder="Nima uchun?" onKeyDown={(e) => e.key === "Enter" && submitExpense()} />
                </div>
                <div className="pl-modal-actions">
                  <button className="pl-btn-ghost" onClick={closeModal}>Bekor qilish</button>
                  <button className="pl-btn-primary" onClick={submitExpense}>Qo'shish</button>
                </div>
              </>
            )}

            {modal.type === "topup" && (
              <>
                <div className="pl-modal-head">
                  <h2 className="pl-modal-title">Byudjetni to'ldirish</h2>
                  <button className="pl-modal-close" onClick={closeModal}><X size={18} /></button>
                </div>
                {formError && <div className="pl-warn"><AlertTriangle size={14} /> {formError}</div>}
                <div className="pl-field">
                  <label>Toifa</label>
                  <select className="pl-select" value={formCategoryId} onChange={(e) => setFormCategoryId(e.target.value)}>
                    {data.categories.map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}
                  </select>
                </div>
                <div className="pl-field">
                  <label>Summasi</label>
                  <input className="pl-input" type="number" min="0" value={formAmount} onChange={(e) => setFormAmount(e.target.value)} placeholder="0" onKeyDown={(e) => e.key === "Enter" && submitTopup()} />
                </div>
                <div className="pl-field">
                  <label>Izoh (ixtiyoriy)</label>
                  <input className="pl-input" value={formNote} onChange={(e) => setFormNote(e.target.value)} placeholder="Masalan: oylik hafta puli" onKeyDown={(e) => e.key === "Enter" && submitTopup()} />
                </div>
                <div className="pl-modal-actions">
                  <button className="pl-btn-ghost" onClick={closeModal}>Bekor qilish</button>
                  <button className="pl-btn-primary" onClick={submitTopup}>To'ldirish</button>
                </div>
              </>
            )}

            {modal.type === "borrow" && (
              <>
                <div className="pl-modal-head">
                  <h2 className="pl-modal-title">Qarz olish</h2>
                  <button className="pl-modal-close" onClick={closeModal}><X size={18} /></button>
                </div>
                {formError && <div className="pl-warn"><AlertTriangle size={14} /> {formError}</div>}
                <div className="pl-field">
                  <label>Kimga (qaysi toifaga)</label>
                  <select className="pl-select" value={formCategoryId} onChange={(e) => setFormCategoryId(e.target.value)}>
                    {data.categories.map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}
                  </select>
                </div>
                <div className="pl-field">
                  <label>Kimdan (qaysi toifadan)</label>
                  <select className="pl-select" value={formFromId} onChange={(e) => setFormFromId(e.target.value)}>
                    {data.categories.filter((c) => c.id !== formCategoryId).map((c) => (
                      <option key={c.id} value={c.id}>{c.emoji} {c.name} — qoldiq {formatMoney(remainingOf(c))}</option>
                    ))}
                  </select>
                </div>
                <div className="pl-field">
                  <label>Summasi</label>
                  <input className="pl-input" type="number" min="0" value={formAmount} onChange={(e) => setFormAmount(e.target.value)} placeholder="0" onKeyDown={(e) => e.key === "Enter" && submitBorrow()} />
                  <p className="pl-hint">Bu miqdor qarz sifatida qayd etiladi va keyinchalik qaytarilishi mumkin.</p>
                </div>
                <div className="pl-field">
                  <label>Izoh (ixtiyoriy)</label>
                  <input className="pl-input" value={formNote} onChange={(e) => setFormNote(e.target.value)} placeholder="Nima uchun?" onKeyDown={(e) => e.key === "Enter" && submitBorrow()} />
                </div>
                <div className="pl-modal-actions">
                  <button className="pl-btn-ghost" onClick={closeModal}>Bekor qilish</button>
                  <button className="pl-btn-primary" onClick={submitBorrow}>Ko'chirish</button>
                </div>
              </>
            )}

            {modal.type === "repay" && (() => {
              const debt = data.debts.find((d) => d.id === modal.ctx.debtId);
              const borrower = debt && findCat(debt.borrowerId);
              const lender = debt && findCat(debt.lenderId);
              if (!debt || !borrower || !lender) return null;
              const maxAllowed = Math.min(debt.amount, remainingOf(borrower));
              return (
                <>
                  <div className="pl-modal-head">
                    <h2 className="pl-modal-title">Qarzni qaytarish</h2>
                    <button className="pl-modal-close" onClick={closeModal}><X size={18} /></button>
                  </div>
                  {formError && <div className="pl-warn"><AlertTriangle size={14} /> {formError}</div>}
                  <p className="pl-hint" style={{ marginBottom: 14 }}>
                    {borrower.emoji} {borrower.name} → {lender.emoji} {lender.name} · jami qarz {formatMoney(debt.amount)}
                  </p>
                  <div className="pl-field">
                    <label>Summasi (eng ko'pi {formatMoney(maxAllowed)})</label>
                    <input className="pl-input" type="number" min="0" max={maxAllowed} value={formAmount} onChange={(e) => setFormAmount(e.target.value)} placeholder="0" onKeyDown={(e) => e.key === "Enter" && submitRepay()} />
                  </div>
                  <div className="pl-modal-actions">
                    <button className="pl-btn-ghost" onClick={closeModal}>Bekor qilish</button>
                    <button className="pl-btn-primary" onClick={submitRepay}>Qaytarish</button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {showSyncModal && (
        <div className="pl-overlay" onClick={() => familyCode && setShowSyncModal(false)}>
          <div className="pl-modal" onClick={(e) => e.stopPropagation()}>
            <div className="pl-modal-head">
              <h2 className="pl-modal-title">
                {familyCode && syncTab === "share" ? "Oila kodi" : "Ukang bilan ulashish"}
              </h2>
              {familyCode && (
                <button className="pl-modal-close" onClick={() => setShowSyncModal(false)}><X size={18} /></button>
              )}
            </div>

            {syncError && <div className="pl-warn"><AlertTriangle size={14} /> {syncError}</div>}

            {familyCode && syncTab === "share" ? (
              <>
                <p className="pl-hint" style={{ marginBottom: 14 }}>
                  Bu kodni ukangga yuboring. U o'z telefonida shu kodni kiritganda ikkalangiz ham bir xil daftarni ko'rasiz.
                </p>
                <div className="pl-sync-pill" style={{ justifyContent: "space-between", width: "100%" }}>
                  <span className="pl-family-code">{familyCode}</span>
                  <button className="pl-copy-btn" onClick={copyFamilyCode}>
                    {copiedCode ? <><Check size={12} /> Nusxalandi</> : <><Copy size={12} /> Nusxalash</>}
                  </button>
                </div>
                <p className="pl-sync-status">
                  {firebaseEnabled()
                    ? `Sinxronizatsiya: ${syncMeta.status === "ok" ? "faol" : syncMeta.status === "error" ? "xato" : "kutilmoqda"} · oxirgi: ${formatSyncTime(syncMeta.lastSyncAt)}`
                    : "Bulut hali sozlanmagan — ikkala telefon uchun Firebase URL kerak (qo'llanma pastda)."}
                </p>
                {firebaseEnabled() ? (
                  <div className="pl-modal-actions">
                    <button className="pl-btn-ghost" onClick={manualSyncNow} disabled={syncingNow}>
                      {syncingNow ? "Sinxronlanmoqda…" : "Hozir sinxronlash"}
                    </button>
                    <button className="pl-btn-primary" onClick={() => setShowSyncModal(false)}>Tushundim</button>
                  </div>
                ) : (
                  <div className="pl-modal-actions">
                    <button className="pl-btn-primary" onClick={() => setShowSyncModal(false)}>Tushundim</button>
                  </div>
                )}
              </>
            ) : (
              <>
                <p className="pl-hint" style={{ marginBottom: 14 }}>
                  Birinchi marta ochayotgan bo'lsangiz — oila yarating va kodni oling. Ukang bo'lsa — siz bergan kodni kiriting.
                </p>
                <div className="pl-sync-tabs">
                  <button
                    className={`pl-sync-tab ${syncTab === "create" ? "active" : ""}`}
                    onClick={() => { setSyncTab("create"); setSyncError(""); }}
                  >
                    Mening kodim
                  </button>
                  <button
                    className={`pl-sync-tab ${syncTab === "join" ? "active" : ""}`}
                    onClick={() => { setSyncTab("join"); setSyncError(""); }}
                  >
                    Kod bilan ulanish
                  </button>
                </div>

                {syncTab === "create" ? (
                  <>
                    <p className="pl-hint">
                      Siz (ota-ona) telefoningizda oila yaratasiz. 6 belgili kod chiqadi — uni ukangga Telegram yoki SMS orqali yuboring.
                    </p>
                    <div className="pl-modal-actions">
                      <button className="pl-btn-primary" onClick={createFamilyRoom}>Kod olish</button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="pl-field">
                      <label>Ulanish kodi</label>
                      <input
                        className="pl-input"
                        value={joinCodeInput}
                        onChange={(e) => setJoinCodeInput(normalizeFamilyCode(e.target.value))}
                        placeholder="Masalan: K7M2XP"
                        maxLength={6}
                        autoFocus
                        style={{ letterSpacing: ".2em", fontFamily: "'IBM Plex Mono', monospace", textTransform: "uppercase" }}
                        onKeyDown={(e) => e.key === "Enter" && joinFamilyRoom()}
                      />
                      <p className="pl-hint">Akang/oping bergan 6 belgili kodni kiriting.</p>
                    </div>
                    <div className="pl-modal-actions">
                      <button className="pl-btn-primary" onClick={joinFamilyRoom} disabled={syncingNow}>
                        {syncingNow ? "Ulanmoqda…" : "Ulanish"}
                      </button>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
import ReactDOM from "react-dom/client";

// Предполагаем, что ваш главный компонент внутри этого файла называется ChontakDaftari
// Если у вас функция называется по-другому, замените слово ChontakDaftari ниже на ваше название
ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ChontakDaftari /> 
  </React.StrictMode>
);
