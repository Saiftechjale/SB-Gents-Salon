export interface UpiIntentParams {
  payeeVpa: string;
  payeeName: string;
  amount: number;
  transactionNote: string;
  transactionRef?: string;
}

export interface UpiDeepLinks {
  generic: string;
  gpay: string;
  phonepe: string;
  paytm: string;
}

export function buildUpiQueryString(params: UpiIntentParams): string {
  const cleanVpa = params.payeeVpa.trim();
  const cleanName = params.payeeName.trim() || 'SB Gents Salon';
  const cleanAmount = Math.max(0, Number(params.amount || 0)).toFixed(2);
  const cleanNote = (params.transactionNote || 'Salon Service Payment').slice(0, 80);
  const cleanRef = (params.transactionRef || `SB${Date.now()}`).replace(/[^a-zA-Z0-9]/g, '').slice(0, 35);

  const search = new URLSearchParams({
    pa: cleanVpa,
    pn: cleanName,
    am: cleanAmount,
    cu: 'INR',
    tn: cleanNote,
    tr: cleanRef,
  });

  return search.toString();
}

export function buildUpiDeepLinks(params: UpiIntentParams): UpiDeepLinks {
  const qs = buildUpiQueryString(params);
  return {
    generic: `upi://pay?${qs}`,
    gpay: `tez://upi/pay?${qs}`,
    phonepe: `phonepe://pay?${qs}`,
    paytm: `paytmmp://pay?${qs}`,
  };
}

export function isValidUpiId(upiId: string): boolean {
  return /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z]{2,64}$/.test(upiId.trim());
}
