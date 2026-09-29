import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Armchair, Clock, RefreshCw, Users, Info, ArrowRight, CheckCircle2 } from "lucide-react";
import { useRestaurant } from "../../hooks/useRestaurant";
import { useTableCheck } from "../../hooks/useTableCheck";
import { useAdaptivePrefs, type AdaptiveLanguage } from "../../context/AdaptivePrefsContext";
import { getOrCreateSessionId } from "../../utils/session";
import {
  reserveTableAtomic,
  TableReservationError,
} from "../../services/tableCheckService";
import { formatWaitLabel } from "../../services/tableWaitTimeService";
import { PageLoader } from "../../components/common/Spinner";
import { AccessibleStatus } from "../../components/customer/AccessibleStatus";
import type { Table } from "../../types/table";

type Strings = Record<string, string>;

const STR: Record<AdaptiveLanguage, Strings> = {
  en: {
    welcomeKicker: "SmartDine",
    welcomeTo: "Welcome to",
    tagline: "Find an available table and start ordering.",
    check: "Check Table Availability",
    info: "Restaurant info",
    address: "Address",
    phone: "Phone",
    choose: "Choose a Table",
    liveNote: "Live availability — updates automatically.",
    refresh: "Refresh",
    availableNow: "Available now",
    available: "Available",
    occupied: "Occupied",
    paymentPending: "Finishing payment",
    reserved: "Reserved",
    reservedNote: "Selection in progress",
    select: "Select Table",
    confirmTitle: "Table",
    confirmAvailable: "Available now",
    confirmSelect: "Select Table",
    cancel: "Cancel",
    justTaken: "Sorry, this table was just taken. Please choose another available table.",
    reserveFailed: "Could not reserve this table. Please try another.",
    yourTable: "Your selected table",
    continue: "Continue to Menu",
    capacity: "Seats",
    empty: "No tables available right now. Please check again in a few minutes.",
    back: "Back",
  },
  tanglish: {
    welcomeKicker: "SmartDine",
    welcomeTo: "Welcome to",
    tagline: "Available table select panni order start pannunga.",
    check: "Table Availability Paarunga",
    info: "Restaurant info",
    address: "Address",
    phone: "Phone",
    choose: "Table Select Pannunga",
    liveNote: "Live availability — automatic-a update aagum.",
    refresh: "Refresh",
    availableNow: "Available now",
    available: "Available",
    occupied: "Occupied",
    paymentPending: "Payment mudikuraanga",
    reserved: "Reserved",
    reservedNote: "Selection in progress",
    select: "Select Table",
    confirmTitle: "Table",
    confirmAvailable: "Available now",
    confirmSelect: "Select Table",
    cancel: "Cancel",
    justTaken: "Sorry, indha table ippo eduthutaanga. Vera table select pannunga.",
    reserveFailed: "Table reserve panna mudiyala. Vera table try pannunga.",
    yourTable: "Unga selected table",
    continue: "Menu-kku Continue Pannunga",
    capacity: "Seats",
    empty: "Ippo tables illa. Konjam time kazhichu check pannunga.",
    back: "Back",
  },
  ta: {
    welcomeKicker: "SmartDine",
    welcomeTo: "வருக",
    tagline: "கிடைக்கும் டேபிளை தேர்ந்து ஆர்டர் செய்யுங்கள்.",
    check: "டேபிள் விவரம் பார்க்க",
    info: "உணவக விவரம்",
    address: "முகவரி",
    phone: "தொலைபேசி",
    choose: "டேபிளை தேர்ந்தெடுங்கள்",
    liveNote: "நேரடி நிலவரம் — தானாக புதுப்பிக்கப்படும்.",
    refresh: "புதுப்பி",
    availableNow: "தற்போது கிடைக்கிறது",
    available: "கிடைக்கிறது",
    occupied: "ஆக்கிரமிக்கப்பட்டுள்ளது",
    paymentPending: "பணம் செலுத்தும் நிலையில்",
    reserved: "ஒதுக்கப்பட்டது",
    reservedNote: "தேர்வு நடக்கிறது",
    select: "டேபிளை தேர்வு",
    confirmTitle: "டேபிள்",
    confirmAvailable: "தற்போது கிடைக்கிறது",
    confirmSelect: "டேபிளை தேர்வு",
    cancel: "ரத்து",
    justTaken: "மன்னிக்கவும், இந்த டேபிள் இப்போது எடுக்கப்பட்டது. வேறு டேபிளை தேர்ந்தெடுங்கள்.",
    reserveFailed: "டேபிளை ஒதுக்க முடியவில்லை. வேறு டேபிளை முயற்சிக்கவும்.",
    yourTable: "உங்கள் டேபிள்",
    continue: "மெனுவுக்கு செல்க",
    capacity: "இருக்கைகள்",
    empty: "தற்போது டேபிள்கள் இல்லை. சிறிது நேரம் கழித்து பார்க்கவும்.",
    back: "பின்",
  },
};

export default function CustomerTableCheck() {
  const { restaurantId = "" } = useParams();
  const navigate = useNavigate();
  const { prefs } = useAdaptivePrefs();
  const lang = prefs.language;
  const S = STR[lang];
  const { restaurant, loading: rLoading } = useRestaurant(restaurantId);
  const { models, counts, loading: tLoading, refresh, sessionId } = useTableCheck(restaurantId);
  const [browsing, setBrowsing] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [confirmTable, setConfirmTable] = useState<Table | null>(null);
  const [reserving, setReserving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [liveMessage, setLiveMessage] = useState("Table check");

  const ownModel = useMemo(
    () => models.find((m) => m.ownReservation && m.status === "RESERVED") ?? null,
    [models]
  );

  const available = useMemo(() => models.filter((m) => m.status === "AVAILABLE" && m.table.isActive && m.table.isAccessAvailable !== false), [models]);
  const occupied = useMemo(() => models.filter((m) => m.status === "OCCUPIED"), [models]);
  const payment = useMemo(() => models.filter((m) => m.status === "PAYMENT_PENDING"), [models]);
  const reserved = useMemo(() => models.filter((m) => m.status === "RESERVED" && !m.ownReservation), [models]);

  async function confirmSelect() {
    if (!confirmTable || reserving) return;
    setReserving(true);
    setError(null);
    try {
      const sid = sessionId || getOrCreateSessionId();
      await reserveTableAtomic(restaurantId, confirmTable, sid);
      const token = confirmTable.qrToken;
      setLiveMessage(`${S.yourTable}: Table ${confirmTable.tableNumber}`);
      navigate(`/menu/${restaurantId}/${confirmTable.id}?token=${token}`);
    } catch (e) {
      const err = e as TableReservationError;
      if (err?.code === "TABLE_RESERVED" || err?.code === "TABLE_OCCUPIED") {
        setError(S.justTaken);
        setLiveMessage(S.justTaken);
      } else {
        setError(S.reserveFailed);
        setLiveMessage(S.reserveFailed);
      }
      setConfirmTable(null);
      refresh();
    } finally {
      setReserving(false);
    }
  }

  function continueToMenu() {
    if (!ownModel) return;
    navigate(`/menu/${restaurantId}/${ownModel.table.id}?token=${ownModel.table.qrToken}`);
  }

  if (!restaurantId || rLoading || tLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center">
        <PageLoader label="Loading restaurant..." />
      </div>
    );
  }

  if (!restaurant || !restaurant.isActive) {
    return (
      <main className="min-h-screen bg-surface-50 flex items-center justify-center p-4">
        <div className="text-center max-w-sm bg-white rounded-2xl border border-surface-200 shadow-card p-8">
          <h1 className="text-xl font-bold tracking-tight text-ink-900">SmartDine</h1>
          <p className="text-sm text-ink-500 mt-2 leading-relaxed">
            {lang === "ta" ? "இந்த உணவகம் தற்போது மூடப்பட்டுள்ளது." : lang === "tanglish" ? "Indha restaurant ippo closed." : "This restaurant is currently not accepting customers."}
          </p>
        </div>
      </main>
    );
  }

  return (
    <main aria-label={`Table check for ${restaurant.name}`} className="min-h-screen bg-surface-50 pb-16">
      <AccessibleStatus message={liveMessage} />
      <header className="bg-ink-900 text-white">
        <div className="max-w-lg mx-auto px-4 py-8 text-center">
          <p className="text-xs font-bold tracking-[0.2em] text-white/60">{S.welcomeKicker}</p>
          <h1 className="text-2xl font-bold tracking-tight mt-2">
            {S.welcomeTo} {restaurant.name}
          </h1>
          {restaurant.description && (
            <p className="text-white/65 text-[13px] mt-2 leading-relaxed line-clamp-2">{restaurant.description}</p>
          )}
          <p className="text-white/80 text-sm mt-3">{S.tagline}</p>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 -mt-0 pt-4 space-y-3">
        {!browsing ? (
          <section aria-label="Table check actions" className="bg-white rounded-2xl border border-surface-200 shadow-card p-5 space-y-3">
            <button
              type="button"
              onClick={() => {
                setBrowsing(true);
                setLiveMessage(S.choose);
              }}
              className="pressable w-full py-3.5 min-h-[52px] rounded-2xl bg-ink-900 text-white font-semibold text-[15px] flex items-center justify-center gap-2"
            >
              <Armchair className="w-5 h-5" aria-hidden="true" />
              {S.check}
            </button>
            <button
              type="button"
              onClick={() => setShowInfo((v) => !v)}
              aria-expanded={showInfo}
              className="pressable w-full py-3 min-h-[48px] rounded-2xl bg-white border border-surface-200 text-ink-700 font-semibold text-sm flex items-center justify-center gap-2"
            >
              <Info className="w-4 h-4" aria-hidden="true" />
              {S.info}
            </button>
            {showInfo && (
              <div className="text-sm text-ink-600 leading-relaxed border-t border-surface-100 pt-3 space-y-1.5">
                {restaurant.address && <p><span className="font-semibold text-ink-900">{S.address}: </span>{restaurant.address}</p>}
                {restaurant.phone && <p><span className="font-semibold text-ink-900">{S.phone}: </span>{restaurant.phone}</p>}
              </div>
            )}
          </section>
        ) : (
          <>
            {ownModel && (
              <section aria-label={S.yourTable} className="bg-green-50 rounded-2xl border border-green-200 shadow-card p-4">
                <p className="text-sm font-bold text-green-800 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                  {S.yourTable}: Table {ownModel.table.tableNumber}
                </p>
                <button
                  type="button"
                  onClick={continueToMenu}
                  className="pressable mt-3 w-full py-3 min-h-[48px] rounded-2xl bg-green-700 text-white font-semibold text-sm flex items-center justify-center gap-2"
                >
                  {S.continue}
                  <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </button>
              </section>
            )}

            <section aria-labelledby="tc-choose-title" className="bg-white rounded-2xl border border-surface-200 shadow-card p-5">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h2 id="tc-choose-title" className="text-[17px] font-bold tracking-tight text-ink-900">{S.choose}</h2>
                  <p className="text-xs text-ink-500 mt-0.5" role="status">
                    {S.liveNote} {counts.available} {S.available} • {counts.occupied} {S.occupied}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    refresh();
                    setLiveMessage(S.refresh);
                  }}
                  aria-label={S.refresh}
                  className="pressable shrink-0 w-11 h-11 rounded-2xl bg-surface-50 border border-surface-200 flex items-center justify-center text-ink-700"
                >
                  <RefreshCw className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>

              {error && (
                <p role="alert" className="mt-3 text-sm font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
                  {error}
                </p>
              )}

              {models.length === 0 && (
                <p className="mt-4 text-sm text-ink-500">{S.empty}</p>
              )}

              {available.length > 0 && (
                <div className="mt-4">
                  <h3 className="text-xs font-bold tracking-wide uppercase text-green-700">{S.availableNow} ({available.length})</h3>
                  <ul className="mt-2 space-y-2.5">
                    {available.map((m) => (
                      <li key={m.table.id} className="flex items-center justify-between gap-3 bg-green-50/60 border border-green-200 rounded-2xl px-4 py-3">
                        <span className="min-w-0">
                          <span className="block font-bold text-ink-900">Table {m.table.tableNumber}</span>
                          <span className="block text-xs text-ink-500 mt-0.5">
                            <Users className="w-3 h-3 inline mr-1" aria-hidden="true" />
                            {S.capacity}: {m.table.capacity} • {S.available}
                          </span>
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setConfirmTable(m.table);
                            setError(null);
                          }}
                          aria-label={`${S.select} Table ${m.table.tableNumber}`}
                          className="pressable shrink-0 px-4 py-2.5 min-h-[44px] rounded-xl bg-ink-900 text-white text-sm font-semibold"
                        >
                          {S.select}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {occupied.length > 0 && (
                <div className="mt-5">
                  <h3 className="text-xs font-bold tracking-wide uppercase text-ink-500">{S.occupied} ({occupied.length})</h3>
                  <ul className="mt-2 space-y-2.5" aria-live="polite">
                    {occupied.map((m) => (
                      <li key={m.table.id} className="bg-surface-50 border border-surface-200 rounded-2xl px-4 py-3">
                        <span className="block font-bold text-ink-900">Table {m.table.tableNumber}</span>
                        <span className="flex items-center gap-1.5 text-xs text-ink-500 mt-1">
                          <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                          {S.occupied}
                          {m.wait && m.wait.remainingMinutes != null && m.wait.label === "approx"
                            ? ` • ${formatWaitLabel(m.wait, lang)}`
                            : m.wait && m.wait.label === "payment"
                              ? ` • ${formatWaitLabel(m.wait, lang)}`
                              : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {payment.length > 0 && (
                <div className="mt-5">
                  <h3 className="text-xs font-bold tracking-wide uppercase text-amber-700">{S.paymentPending} ({payment.length})</h3>
                  <ul className="mt-2 space-y-2.5">
                    {payment.map((m) => (
                      <li key={m.table.id} className="bg-amber-50/60 border border-amber-200 rounded-2xl px-4 py-3">
                        <span className="block font-bold text-ink-900">Table {m.table.tableNumber}</span>
                        <span className="block text-xs text-amber-700 mt-1 font-medium">{S.paymentPending}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {reserved.length > 0 && (
                <div className="mt-5">
                  <h3 className="text-xs font-bold tracking-wide uppercase text-ink-500">{S.reserved} ({reserved.length})</h3>
                  <ul className="mt-2 space-y-2.5">
                    {reserved.map((m) => (
                      <li key={m.table.id} className="bg-surface-50 border border-surface-200 rounded-2xl px-4 py-3">
                        <span className="block font-bold text-ink-900">Table {m.table.tableNumber}</span>
                        <span className="block text-xs text-ink-500 mt-1">{S.reserved} • {S.reservedNote}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <button
                type="button"
                onClick={() => setBrowsing(false)}
                className="pressable mt-4 text-sm font-semibold text-ink-500 hover:text-ink-900 px-2 py-2 min-h-[44px]"
              >
                ← {S.back}
              </button>
            </section>
          </>
        )}
      </div>

      {confirmTable && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="tc-confirm-title">
          <div className="absolute inset-0 bg-ink-900/45" onClick={() => !reserving && setConfirmTable(null)} aria-hidden="true" />
          <div className="relative w-full max-w-sm bg-white rounded-3xl border border-surface-200 shadow-medium p-6">
            <h2 id="tc-confirm-title" className="text-lg font-bold tracking-tight text-ink-900">
              {S.confirmTitle} {confirmTable.tableNumber}
            </h2>
            <p className="text-sm text-green-700 font-semibold mt-1">{S.confirmAvailable} • {S.capacity}: {confirmTable.capacity}</p>
            <div className="flex gap-2.5 mt-5">
              <button
                type="button"
                onClick={() => setConfirmTable(null)}
                disabled={reserving}
                className="pressable flex-1 py-3 min-h-[48px] rounded-2xl bg-white border border-surface-200 text-ink-700 font-semibold text-sm disabled:opacity-50"
              >
                {S.cancel}
              </button>
              <button
                type="button"
                onClick={confirmSelect}
                disabled={reserving}
                className="pressable flex-1 py-3 min-h-[48px] rounded-2xl bg-ink-900 text-white font-semibold text-sm disabled:opacity-50"
              >
                {reserving ? "…" : S.confirmSelect}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
