import { NextRequest, NextResponse } from "next/server";
import { PROMO_CODE, setPaidCookie } from "@/lib/payment";

export async function POST(request: NextRequest) {
  try {
    const { promoCode, cardNumber, cardName, cardExp, cardCvc } = await request.json();

    // Promo code path — free unlock
    if (typeof promoCode === "string" && promoCode.trim()) {
      if (promoCode.trim().toLowerCase() === PROMO_CODE) {
        const res = NextResponse.json({
          ok: true,
          kind: "promo",
          message: "Code promotionnel validé. Accès débloqué.",
        });
        setPaidCookie(res, "promo");
        return res;
      }
      return NextResponse.json(
        { error: "Code promotionnel invalide." },
        { status: 400 }
      );
    }

    // Paid path — basic card shape validation, no real processor wired.
    const digits = (cardNumber || "").replace(/\s+/g, "");
    if (!digits || digits.length < 12 || !/^\d+$/.test(digits)) {
      return NextResponse.json(
        { error: "Numéro de carte invalide." },
        { status: 400 }
      );
    }
    if (!cardName || typeof cardName !== "string" || !cardName.trim()) {
      return NextResponse.json(
        { error: "Nom du titulaire requis." },
        { status: 400 }
      );
    }
    if (!cardExp || !/^\d{2}\s*\/\s*\d{2}$/.test(cardExp)) {
      return NextResponse.json(
        { error: "Date d'expiration invalide (MM/AA)." },
        { status: 400 }
      );
    }
    if (!cardCvc || !/^\d{3,4}$/.test(cardCvc)) {
      return NextResponse.json(
        { error: "CVC invalide." },
        { status: 400 }
      );
    }

    // No real payment processor — reject so the only real unlock is the promo code.
    return NextResponse.json(
      {
        error:
          "Le traitement de paiement par carte n'est pas encore connecté. Utilisez un code promotionnel pour débloquer l'accès.",
      },
      { status: 402 }
    );
  } catch {
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
