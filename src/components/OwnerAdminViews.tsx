import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Clock,
  Copy,
  Edit3,
  Eye,
  EyeOff,
  FileSpreadsheet,
  FileText,
  Gift,
  History,
  ImagePlus,
  KeyRound,
  Link2,
  Megaphone,
  Plus,
  RotateCcw,
  Scissors,
  Search,
  Settings,
  Sparkles,
  Star,
  Tag,
  Trash2,
  Upload,
  UserCheck,
  UserPlus,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import type {
  Customer,
  HeroTextBlock,
  SalonBootstrapData,
  SalonOffer,
  SalonReview,
  ServiceItem,
  StaffMember,
  TickerItem,
} from '../types/salon';
import { Language, t } from '../lib/i18n';
import { exportReportToExcel, exportReportToPDF, ReportExportOptions } from '../lib/exportReports';
import { UpiIntentLauncher } from './UpiIntentLauncher';
import { isValidUpiId } from '../lib/upiIntent';
import type { OwnerSectionTab } from './OwnerOperationsViews';

interface OwnerAdminViewsProps {
  activeSubTab: 'CUSTOMERS' | 'STAFF' | 'SERVICES' | 'UDHAR' | 'COMMISSION' | 'EXPENSES' | 'REPORTS' | 'SETTINGS';
  setActiveSubTab?: (tab: OwnerSectionTab) => void;
  data: SalonBootstrapData;
  lang: Language;
  onRefresh: () => Promise<void>;
  notify: (type: 'success' | 'error', message: string) => void;
}

type ReportType =
  | 'DAILY_SALES'
  | 'WEEKLY_REPORT'
  | 'MONTHLY_REPORT'
  | 'CASH_COLLECTION'
  | 'UPI_COLLECTION'
  | 'OUTSTANDING_DUES'
  | 'STAFF_COMMISSION'
  | 'SERVICE_REVENUE'
  | 'EXPENSE_REPORT';

export const OwnerAdminViews: React.FC<OwnerAdminViewsProps> = ({
  activeSubTab,
  setActiveSubTab,
  data,
  lang,
  onRefresh,
  notify,
}) => {
  const todayStr = new Date().toISOString().slice(0, 10);

  // ============================================================================
  // 1. CUSTOMERS, HAIRCUT HISTORY & UDHAR SETTLEMENT STATE
  // ============================================================================
  const [customerSearch, setCustomerSearch] = useState('');
  const [onlyWithDue, setOnlyWithDue] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [settleCash, setSettleCash] = useState<number>(0);
  const [settleUpi, setSettleUpi] = useState<number>(0);
  const [settleNotes, setSettleNotes] = useState('');
  const [settlingDue, setSettlingDue] = useState(false);

  // ============================================================================
  // 2. STAFF MANAGEMENT STATE
  // ============================================================================
  const [staffName, setStaffName] = useState('');
  const [staffPhone, setStaffPhone] = useState('');
  const [staffSpecialty, setStaffSpecialty] = useState('Senior Barber');
  const [staffCommissionPct, setStaffCommissionPct] = useState<number>(40);
  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null);
  const [confirmDeactivateStaffId, setConfirmDeactivateStaffId] = useState<string | null>(null);

  // ============================================================================
  // 3. SERVICES MANAGEMENT STATE
  // ============================================================================
  const [serviceName, setServiceName] = useState('');
  const [serviceNameHi, setServiceNameHi] = useState('');
  const [serviceCategory, setServiceCategory] = useState('Hair');
  const [servicePrice, setServicePrice] = useState<number>(150);
  const [serviceDuration, setServiceDuration] = useState<number>(30);
  const [editingService, setEditingService] = useState<ServiceItem | null>(null);
  const [quickPriceEdits, setQuickPriceEdits] = useState<Record<string, number>>({});
  const [confirmDeleteServiceId, setConfirmDeleteServiceId] = useState<string | null>(null);

  // ============================================================================
  // 4. EXPENSES MANAGEMENT STATE
  // ============================================================================
  const [expTitle, setExpTitle] = useState('');
  const [expCategory, setExpCategory] = useState('Shop Supplies');
  const [expAmount, setExpAmount] = useState<number>(0);
  const [expMode, setExpMode] = useState<'CASH' | 'UPI'>('CASH');
  const [expDate, setExpDate] = useState(todayStr);
  const [expNotes, setExpNotes] = useState('');
  const [confirmDeleteExpenseId, setConfirmDeleteExpenseId] = useState<string | null>(null);

  // ============================================================================
  // 5. REPORTS STATE
  // ============================================================================
  const [selectedReportType, setSelectedReportType] = useState<ReportType>('DAILY_SALES');
  const [reportReferenceDate, setReportReferenceDate] = useState(todayStr);

  // ============================================================================
  // 6. SALON SETTINGS STATE (Complete Control Center)
  // ============================================================================
  const [settingsSection, setSettingsSection] = useState<'SHOWCASE' | 'GENERAL' | 'SLOTS_PINS'>('SHOWCASE');
  const [salonName, setSalonName] = useState(data.salon.name);
  const [salonPhone, setSalonPhone] = useState(data.salon.phone);
  const [salonAddress, setSalonAddress] = useState(data.salon.address);
  const [openingTime, setOpeningTime] = useState(data.settings.opening_time);
  const [closingTime, setClosingTime] = useState(data.settings.closing_time);
  const [slotDuration, setSlotDuration] = useState(data.settings.slot_duration_minutes);
  const [weeklyHolidays, setWeeklyHolidays] = useState<string[]>(data.settings.weekly_holidays);
  const [upiId, setUpiId] = useState<string>(data.settings.upi_id || '');
  const [upiMerchantName, setUpiMerchantName] = useState<string>(
    data.settings.upi_merchant_name || data.salon.name
  );
  const [regenerateSlots, setRegenerateSlots] = useState(false);
  const [customSlotTime, setCustomSlotTime] = useState('');
  const [newOwnerPin, setNewOwnerPin] = useState('');
  const [newStaffPin, setNewStaffPin] = useState('');
  const [copiedLinkKey, setCopiedLinkKey] = useState<string | null>(null);

  // ============================================================================
  // 7. HOME SLIDES (3-4), HEADER/FOOTER TEXTS, TICKER, OFFERS & REVIEWS STATE
  // ============================================================================
  const [heroImagesList, setHeroImagesList] = useState<string[]>(() => {
    const raw = (data.showcase?.hero_images || []).filter(Boolean);
    if (raw.length > 0) return raw.slice(0, 4);
    return [
      data.showcase?.hero_image_url || '/src/assets/images/salon_hero_interior_1795068719871.jpg',
    ];
  });
  const [newSlideUrl, setNewSlideUrl] = useState('');
  const [heroBadgeInput, setHeroBadgeInput] = useState(data.showcase?.hero_badge || '');
  const [heroTitleInput, setHeroTitleInput] = useState(data.showcase?.hero_title || '');
  const [heroSubtitleInput, setHeroSubtitleInput] = useState(data.showcase?.hero_subtitle || '');
  const [footerTaglineInput, setFooterTaglineInput] = useState(data.showcase?.footer_tagline || '');
  const [developerCreditInput, setDeveloperCreditInput] = useState(
    data.showcase?.developer_credit || 'Mirza Saif'
  );
  const [heroHighlights, setHeroHighlights] = useState<HeroTextBlock[]>(
    data.showcase?.hero_highlights || []
  );
  const [newHighlightText, setNewHighlightText] = useState('');
  const [tickerEnabled, setTickerEnabled] = useState<boolean>(
    data.showcase?.ticker_enabled ?? true
  );
  const [tickerItems, setTickerItems] = useState<TickerItem[]>(
    data.showcase?.ticker_items || []
  );
  const [newTickerText, setNewTickerText] = useState('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [savingShowcase, setSavingShowcase] = useState(false);

  // Offer Popup CRUD State
  const [offerTitle, setOfferTitle] = useState('');
  const [offerBadge, setOfferBadge] = useState('SPECIAL OFFER');
  const [offerDesc, setOfferDesc] = useState('');
  const [offerValidUntil, setOfferValidUntil] = useState('');
  const [offerShowPopup, setOfferShowPopup] = useState(true);
  const [editingOffer, setEditingOffer] = useState<SalonOffer | null>(null);

  // Review Edit State
  const [editingReview, setEditingReview] = useState<SalonReview | null>(null);

  useEffect(() => {
    setSalonName(data.salon.name);
    setSalonPhone(data.salon.phone);
    setSalonAddress(data.salon.address);
  }, [data.salon.name, data.salon.phone, data.salon.address]);

  useEffect(() => {
    if (!data.showcase) return;
    const rawSlides = (data.showcase.hero_images || []).filter(Boolean);
    setHeroImagesList(
      rawSlides.length > 0
        ? rawSlides.slice(0, 4)
        : [data.showcase.hero_image_url || '/src/assets/images/salon_hero_interior_1795068719871.jpg']
    );
    setHeroBadgeInput(data.showcase.hero_badge || '');
    setHeroTitleInput(data.showcase.hero_title || '');
    setHeroSubtitleInput(data.showcase.hero_subtitle || '');
    setFooterTaglineInput(data.showcase.footer_tagline || '');
    setDeveloperCreditInput(data.showcase.developer_credit || 'Mirza Saif');
    setHeroHighlights(data.showcase.hero_highlights || []);
    setTickerEnabled(Boolean(data.showcase.ticker_enabled));
    setTickerItems(data.showcase.ticker_items || []);
  }, [data.showcase]);

  // Filtered customers
  const filteredCustomers = useMemo(() => {
    const q = customerSearch.trim().toLowerCase();
    return data.customers.filter((c) => {
      if (onlyWithDue && c.outstanding_due <= 0) return false;
      if (!q) return true;
      return c.name.toLowerCase().includes(q) || c.phone.includes(q);
    });
  }, [data.customers, customerSearch, onlyWithDue]);

  // Handlers for Customer Management & Udhar Due Settlement
  const handleSaveCustomerEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCustomer) return;
    try {
      const res = await fetch(`/api/customers/${editingCustomer.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editingCustomer.name,
          phone: editingCustomer.phone,
          haircut_preference: editingCustomer.haircut_preference,
          special_notes: editingCustomer.special_notes,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        notify('error', err.error || 'Could not update customer');
        return;
      }
      setEditingCustomer(null);
      await onRefresh();
      notify('success', 'Customer record updated');
    } catch (err) {
      notify('error', String(err));
    }
  };

  const handleSettleDue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer) return;
    const totalSettled = Number(settleCash || 0) + Number(settleUpi || 0);
    if (totalSettled <= 0) {
      notify('error', 'Enter a settlement amount greater than ₹0.');
      return;
    }
    setSettlingDue(true);
    try {
      const res = await fetch('/api/payments/settle-due', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: selectedCustomer.id,
          cash_paid: Number(settleCash || 0),
          upi_paid: Number(settleUpi || 0),
          notes: settleNotes.trim(),
          payment_date: todayStr,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        notify('error', json.error || 'Failed to settle Udhar');
        return;
      }
      setSettleCash(0);
      setSettleUpi(0);
      setSettleNotes('');
      setSelectedCustomer(json.customer);
      await onRefresh();
      notify('success', `Collected ₹${totalSettled} Udhar settlement from ${json.customer.name}`);
    } catch (err) {
      notify('error', String(err));
    } finally {
      setSettlingDue(false);
    }
  };

  // Handlers for Staff Management
  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!staffName.trim() || !staffPhone.trim()) {
      notify('error', 'Staff name and phone number are required.');
      return;
    }
    try {
      const res = await fetch('/api/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: staffName.trim(),
          phone: staffPhone.trim(),
          specialty: staffSpecialty.trim(),
          commission_pct: Number(staffCommissionPct),
          is_owner: false,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        notify('error', err.error || 'Could not add staff');
        return;
      }
      setStaffName('');
      setStaffPhone('');
      setStaffSpecialty('Senior Barber');
      setStaffCommissionPct(40);
      await onRefresh();
      notify('success', 'New staff member added');
    } catch (err) {
      notify('error', String(err));
    }
  };

  const handleUpdateStaff = async (member: StaffMember) => {
    try {
      const res = await fetch(`/api/staff/${member.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(member),
      });
      const json = await res.json();
      if (!res.ok) {
        notify('error', json.error || 'Could not update staff member');
        return;
      }
      setEditingStaff(null);
      setConfirmDeactivateStaffId(null);
      await onRefresh();
      notify('success', `${member.name} updated (all historical records preserved)`);
    } catch (err) {
      notify('error', String(err));
    }
  };

  // Handlers for Services Management
  const handleAddService = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!serviceName.trim() || servicePrice < 0) {
      notify('error', 'Valid service name and price are required.');
      return;
    }
    try {
      const res = await fetch('/api/services', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: serviceName.trim(),
          name_hi: serviceNameHi.trim() || serviceName.trim(),
          category: serviceCategory.trim(),
          price: Number(servicePrice),
          duration_minutes: Number(serviceDuration),
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        notify('error', err.error || 'Failed to add service');
        return;
      }
      setServiceName('');
      setServiceNameHi('');
      setServicePrice(150);
      await onRefresh();
      notify('success', 'New service added');
    } catch (err) {
      notify('error', String(err));
    }
  };

  const handleUpdateService = async (srv: ServiceItem) => {
    try {
      const res = await fetch(`/api/services/${srv.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(srv),
      });
      if (!res.ok) {
        notify('error', 'Failed to update service');
        return;
      }
      setEditingService(null);
      await onRefresh();
      notify('success', `${srv.name} updated (₹${srv.price})`);
    } catch (err) {
      notify('error', String(err));
    }
  };

  const handleDeleteService = async (id: string) => {
    try {
      const res = await fetch(`/api/services/${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) {
        notify('error', json.error || 'Could not delete service');
        return;
      }
      setConfirmDeleteServiceId(null);
      await onRefresh();
      notify(
        'success',
        json.deactivated
          ? 'Service deactivated (past booking history preserved)'
          : 'Service deleted permanently'
      );
    } catch (err) {
      notify('error', String(err));
    }
  };

  // Handlers for Expenses Management
  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expTitle.trim() || expAmount <= 0) {
      notify('error', 'Expense title and positive amount are required.');
      return;
    }
    try {
      const res = await fetch('/api/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: expTitle.trim(),
          category: expCategory,
          amount: Number(expAmount),
          payment_mode: expMode,
          expense_date: expDate,
          notes: expNotes.trim(),
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        notify('error', err.error || 'Failed to add expense');
        return;
      }
      setExpTitle('');
      setExpAmount(0);
      setExpNotes('');
      await onRefresh();
      notify('success', 'Expense recorded');
    } catch (err) {
      notify('error', String(err));
    }
  };

  const handleDeleteExpense = async (id: string) => {
    try {
      const res = await fetch(`/api/expenses/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        notify('error', 'Could not delete expense');
        return;
      }
      setConfirmDeleteExpenseId(null);
      await onRefresh();
      notify('success', 'Expense deleted');
    } catch (err) {
      notify('error', String(err));
    }
  };

  // Handlers for Salon Settings
  const handleQuickSaveUpiId = async (newUpiId: string) => {
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          upi_id: newUpiId,
          upi_merchant_name: upiMerchantName || data.salon.name,
        }),
      });
      if (!res.ok) {
        notify('error', 'Failed to save UPI ID');
        return;
      }
      setUpiId(newUpiId);
      await onRefresh();
      notify('success', `Salon UPI ID (${newUpiId}) saved!`);
    } catch (err) {
      notify('error', String(err));
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (upiId.trim() && !isValidUpiId(upiId.trim())) {
      notify('error', 'Please enter a valid UPI ID (e.g., 9876543210@ybl or salon@okicici).');
      return;
    }
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          salon_name: salonName,
          salon_phone: salonPhone,
          salon_address: salonAddress,
          opening_time: openingTime,
          closing_time: closingTime,
          slot_duration_minutes: Number(slotDuration),
          weekly_holidays: weeklyHolidays,
          upi_id: upiId.trim(),
          upi_merchant_name: upiMerchantName.trim() || salonName,
          regenerate_slots: regenerateSlots,
        }),
      });
      if (!res.ok) {
        notify('error', 'Failed to update settings');
        return;
      }
      setRegenerateSlots(false);
      await onRefresh();
      notify('success', 'Salon settings saved');
    } catch (err) {
      notify('error', String(err));
    }
  };

  const handleToggleSlot = async (slotId: string, enabled: boolean) => {
    try {
      await fetch(`/api/time-slots/${slotId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_enabled: enabled }),
      });
      await onRefresh();
    } catch (err) {
      notify('error', String(err));
    }
  };

  const handleAddCustomSlot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customSlotTime) return;
    try {
      const res = await fetch('/api/time-slots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slot_time: customSlotTime }),
      });
      const json = await res.json();
      if (!res.ok) {
        notify('error', json.error || 'Could not add time slot');
        return;
      }
      setCustomSlotTime('');
      await onRefresh();
      notify('success', `Time slot ${json.timeSlot.slot_time} added`);
    } catch (err) {
      notify('error', String(err));
    }
  };

  const handleDeleteSlot = async (slotId: string) => {
    try {
      const res = await fetch(`/api/time-slots/${slotId}`, { method: 'DELETE' });
      if (!res.ok) {
        notify('error', 'Could not delete time slot');
        return;
      }
      await onRefresh();
      notify('success', 'Time slot deleted');
    } catch (err) {
      notify('error', String(err));
    }
  };

  const handleSavePortalPins = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      (newOwnerPin && newOwnerPin.trim().length < 4) ||
      (newStaffPin && newStaffPin.trim().length < 4)
    ) {
      notify('error', 'Each PIN must be at least 4 digits.');
      return;
    }
    if (!newOwnerPin && !newStaffPin) {
      notify('error', 'Enter a new Owner PIN or Staff PIN to update.');
      return;
    }
    try {
      const res = await fetch('/api/auth/pins', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          new_owner_pin: newOwnerPin.trim() || undefined,
          new_staff_pin: newStaffPin.trim() || undefined,
        }),
      });
      if (!res.ok) {
        notify('error', 'Could not update PINs');
        return;
      }
      setNewOwnerPin('');
      setNewStaffPin('');
      notify('success', 'Portal login PIN(s) updated successfully!');
    } catch (err) {
      notify('error', String(err));
    }
  };

  const handleCopyPortalLink = async (key: string, url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedLinkKey(key);
      notify('success', 'Link copied to clipboard!');
      setTimeout(() => setCopiedLinkKey((prev) => (prev === key ? null : prev)), 2500);
    } catch {
      notify('error', 'Could not copy link');
    }
  };

  // Handlers for Home Slides, Header/Footer Texts, Ticker, Offers & Reviews
  const saveShowcaseConfig = async (overrides?: {
    hero_images?: string[];
    hero_image_url?: string;
    hero_highlights?: HeroTextBlock[];
    ticker_enabled?: boolean;
    ticker_items?: TickerItem[];
  }) => {
    setSavingShowcase(true);
    try {
      const nextImages = (overrides?.hero_images ?? heroImagesList)
        .map((u) => u.trim())
        .filter(Boolean)
        .slice(0, 4);

      if (salonName.trim() && salonName.trim() !== data.salon.name) {
        await fetch('/api/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ salon_name: salonName.trim() }),
        });
      }

      const res = await fetch('/api/showcase', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hero_images: nextImages,
          hero_image_url: overrides?.hero_image_url ?? nextImages[0],
          hero_badge: heroBadgeInput,
          hero_title: heroTitleInput,
          hero_subtitle: heroSubtitleInput,
          footer_tagline: footerTaglineInput,
          developer_credit: developerCreditInput.trim() || 'Mirza Saif',
          hero_highlights: overrides?.hero_highlights ?? heroHighlights,
          ticker_enabled: overrides?.ticker_enabled ?? tickerEnabled,
          ticker_items: overrides?.ticker_items ?? tickerItems,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        notify('error', err.error || 'Could not save settings');
        return;
      }
      await onRefresh();
      notify('success', 'Saved!');
    } catch (err) {
      notify('error', String(err));
    } finally {
      setSavingShowcase(false);
    }
  };

  const handleUploadHeroImageFile = async (
    e: React.ChangeEvent<HTMLInputElement>,
    slotIndex?: number
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPhoto(true);
    try {
      const rawDataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Failed to read image file'));
        reader.readAsDataURL(file);
      });

      const compressedDataUrl = await new Promise<string>((resolve) => {
        const img = new Image();
        img.onload = () => {
          const maxWidth = 1400;
          const scale = img.width > maxWidth ? maxWidth / img.width : 1;
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(rawDataUrl);
            return;
          }
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', 0.86));
        };
        img.onerror = () => resolve(rawDataUrl);
        img.src = rawDataUrl;
      });

      const res = await fetch('/api/showcase/upload-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data_url: compressedDataUrl,
          slot_index: typeof slotIndex === 'number' ? slotIndex : undefined,
          mode: typeof slotIndex === 'number' ? 'replace' : 'append',
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        notify('error', json.error || 'Photo upload failed');
        return;
      }
      if (Array.isArray(json.hero_images)) {
        setHeroImagesList(json.hero_images);
      }
      await onRefresh();
      notify('success', 'Slide photo uploaded!');
    } catch (err) {
      notify('error', String(err));
    } finally {
      setUploadingPhoto(false);
      e.target.value = '';
    }
  };

  const handleAddSlideUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newSlideUrl.trim();
    if (!trimmed || heroImagesList.length >= 4) return;
    const next = [...heroImagesList, trimmed].slice(0, 4);
    setHeroImagesList(next);
    setNewSlideUrl('');
    await saveShowcaseConfig({ hero_images: next });
  };

  const handleRemoveSlide = async (idx: number) => {
    const filtered = heroImagesList.filter((_, i) => i !== idx);
    const next =
      filtered.length > 0
        ? filtered
        : ['/src/assets/images/salon_hero_interior_1795068719871.jpg'];
    setHeroImagesList(next);
    await saveShowcaseConfig({ hero_images: next });
  };

  const handleAddHighlight = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newHighlightText.trim()) return;
    const next: HeroTextBlock[] = [
      ...heroHighlights,
      { id: `hl_${Date.now()}`, text: newHighlightText.trim(), is_active: true },
    ];
    setHeroHighlights(next);
    setNewHighlightText('');
    await saveShowcaseConfig({ hero_highlights: next });
  };

  const handleAddTickerItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTickerText.trim()) return;
    const next: TickerItem[] = [
      ...tickerItems,
      { id: `tk_${Date.now()}`, text: newTickerText.trim(), is_active: true },
    ];
    setTickerItems(next);
    setNewTickerText('');
    await saveShowcaseConfig({ ticker_items: next });
  };

  const handleAddOffer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!offerTitle.trim()) {
      notify('error', 'Offer title is required.');
      return;
    }
    try {
      const res = await fetch('/api/offers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: offerTitle.trim(),
          badge: offerBadge.trim() || 'SPECIAL OFFER',
          description: offerDesc.trim(),
          valid_until: offerValidUntil.trim(),
          show_popup: offerShowPopup,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        notify('error', json.error || 'Could not add offer');
        return;
      }
      setOfferTitle('');
      setOfferDesc('');
      setOfferValidUntil('');
      setOfferShowPopup(true);
      await onRefresh();
      notify('success', 'Offer added!');
    } catch (err) {
      notify('error', String(err));
    }
  };

  const handleUpdateOffer = async (offer: SalonOffer) => {
    try {
      const res = await fetch(`/api/offers/${offer.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(offer),
      });
      if (!res.ok) {
        notify('error', 'Could not update offer');
        return;
      }
      setEditingOffer(null);
      await onRefresh();
      notify('success', 'Offer updated!');
    } catch (err) {
      notify('error', String(err));
    }
  };

  const handleDeleteOffer = async (id: string) => {
    try {
      const res = await fetch(`/api/offers/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        notify('error', 'Could not delete offer');
        return;
      }
      await onRefresh();
      notify('success', 'Offer deleted!');
    } catch (err) {
      notify('error', String(err));
    }
  };

  const handleUpdateReview = async (review: SalonReview) => {
    try {
      const res = await fetch(`/api/reviews/${review.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(review),
      });
      if (!res.ok) {
        notify('error', 'Could not update review');
        return;
      }
      setEditingReview(null);
      await onRefresh();
      notify('success', 'Review updated!');
    } catch (err) {
      notify('error', String(err));
    }
  };

  const handleDeleteReview = async (id: string) => {
    try {
      const res = await fetch(`/api/reviews/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        notify('error', 'Could not delete review');
        return;
      }
      await onRefresh();
      notify('success', 'Review deleted!');
    } catch (err) {
      notify('error', String(err));
    }
  };

  // ============================================================================
  // DYNAMIC REPORT BUILDER (All 9 Required Reports for PDF & Excel Export)
  // ============================================================================
  const currentReportData = useMemo((): ReportExportOptions => {
    const refDate = new Date(`${reportReferenceDate}T12:00:00`);
    const weekAgo = new Date(refDate);
    weekAgo.setDate(refDate.getDate() - 6);
    const weekAgoStr = weekAgo.toISOString().slice(0, 10);
    const monthPrefix = reportReferenceDate.slice(0, 7); // YYYY-MM

    if (selectedReportType === 'DAILY_SALES') {
      const rows = data.payments
        .filter((p) => p.payment_date === reportReferenceDate)
        .map((p) => [
          p.payment_date,
          p.customer_name,
          p.barber_name || 'Due Settlement',
          p.payment_type,
          `₹${p.total_bill}`,
          `₹${p.cash_paid}`,
          `₹${p.upi_paid}`,
          `₹${p.total_collected}`,
          `₹${p.udhar_amount}`,
        ]);
      const totalSales = data.payments
        .filter((p) => p.payment_date === reportReferenceDate && p.payment_type === 'BILL_PAYMENT')
        .reduce((s, p) => s + Number(p.total_bill), 0);
      const totalCollected = data.payments
        .filter((p) => p.payment_date === reportReferenceDate)
        .reduce((s, p) => s + Number(p.total_collected), 0);

      return {
        reportTitle: 'Daily Sales & Collection Report',
        salonName: data.salon.name,
        dateRangeLabel: reportReferenceDate,
        summaryItems: [
          { label: 'Total Service Sales', value: `₹${totalSales}` },
          { label: 'Total Collected (Cash + UPI)', value: `₹${totalCollected}` },
          { label: 'Transactions', value: String(rows.length) },
        ],
        headers: ['Date', 'Customer', 'Barber', 'Type', 'Total Bill', 'Cash', 'UPI', 'Collected', 'Udhar'],
        rows,
        fileNamePrefix: 'SB_Daily_Sales_Report',
      };
    }

    if (selectedReportType === 'WEEKLY_REPORT') {
      const filtered = data.payments.filter(
        (p) => p.payment_date >= weekAgoStr && p.payment_date <= reportReferenceDate
      );
      const totalSales = filtered
        .filter((p) => p.payment_type === 'BILL_PAYMENT')
        .reduce((s, p) => s + Number(p.total_bill), 0);
      const totalCollected = filtered.reduce((s, p) => s + Number(p.total_collected), 0);
      return {
        reportTitle: 'Weekly Revenue & Collection Report',
        salonName: data.salon.name,
        dateRangeLabel: `${weekAgoStr} to ${reportReferenceDate}`,
        summaryItems: [
          { label: '7-Day Total Sales', value: `₹${totalSales}` },
          { label: '7-Day Total Collected', value: `₹${totalCollected}` },
        ],
        headers: ['Date', 'Customer', 'Barber', 'Total Bill', 'Cash Paid', 'UPI Paid', 'Collected', 'Udhar'],
        rows: filtered.map((p) => [
          p.payment_date,
          p.customer_name,
          p.barber_name || 'Settlement',
          `₹${p.total_bill}`,
          `₹${p.cash_paid}`,
          `₹${p.upi_paid}`,
          `₹${p.total_collected}`,
          `₹${p.udhar_amount}`,
        ]),
        fileNamePrefix: 'SB_Weekly_Report',
      };
    }

    if (selectedReportType === 'MONTHLY_REPORT') {
      const filtered = data.payments.filter((p) => p.payment_date.startsWith(monthPrefix));
      const monthExpenses = data.expenses
        .filter((e) => e.expense_date.startsWith(monthPrefix))
        .reduce((s, e) => s + Number(e.amount), 0);
      const totalSales = filtered
        .filter((p) => p.payment_type === 'BILL_PAYMENT')
        .reduce((s, p) => s + Number(p.total_bill), 0);
      const totalCollected = filtered.reduce((s, p) => s + Number(p.total_collected), 0);

      return {
        reportTitle: 'Monthly Business Summary Report',
        salonName: data.salon.name,
        dateRangeLabel: `Month: ${monthPrefix}`,
        summaryItems: [
          { label: 'Monthly Sales', value: `₹${totalSales}` },
          { label: 'Monthly Collected', value: `₹${totalCollected}` },
          { label: 'Monthly Expenses', value: `₹${monthExpenses}` },
          { label: 'Net Collection', value: `₹${totalCollected - monthExpenses}` },
        ],
        headers: ['Date', 'Customer', 'Barber', 'Bill', 'Cash', 'UPI', 'Collected', 'Udhar'],
        rows: filtered.map((p) => [
          p.payment_date,
          p.customer_name,
          p.barber_name || 'Settlement',
          `₹${p.total_bill}`,
          `₹${p.cash_paid}`,
          `₹${p.upi_paid}`,
          `₹${p.total_collected}`,
          `₹${p.udhar_amount}`,
        ]),
        fileNamePrefix: 'SB_Monthly_Report',
      };
    }

    if (selectedReportType === 'CASH_COLLECTION') {
      const cashPayments = data.payments.filter((p) => Number(p.cash_paid) > 0);
      const totalCash = cashPayments.reduce((s, p) => s + Number(p.cash_paid), 0);
      return {
        reportTitle: 'Cash Collection Report',
        salonName: data.salon.name,
        dateRangeLabel: 'All Recorded Cash Collections',
        summaryItems: [
          { label: 'Total Cash Collected', value: `₹${totalCash}` },
          { label: 'Cash Receipts Count', value: String(cashPayments.length) },
        ],
        headers: ['Date', 'Customer', 'Type', 'Barber', 'Cash Received', 'Notes'],
        rows: cashPayments.map((p) => [
          p.payment_date,
          p.customer_name,
          p.payment_type,
          p.barber_name || '—',
          `₹${p.cash_paid}`,
          p.notes || '—',
        ]),
        fileNamePrefix: 'SB_Cash_Collection_Report',
      };
    }

    if (selectedReportType === 'UPI_COLLECTION') {
      const upiPayments = data.payments.filter((p) => Number(p.upi_paid) > 0);
      const totalUpi = upiPayments.reduce((s, p) => s + Number(p.upi_paid), 0);
      return {
        reportTitle: 'UPI Digital Collection Report',
        salonName: data.salon.name,
        dateRangeLabel: 'All Recorded UPI Collections',
        summaryItems: [
          { label: 'Total UPI Collected', value: `₹${totalUpi}` },
          { label: 'UPI Transactions', value: String(upiPayments.length) },
        ],
        headers: ['Date', 'Customer', 'Type', 'Barber', 'UPI Received', 'Notes'],
        rows: upiPayments.map((p) => [
          p.payment_date,
          p.customer_name,
          p.payment_type,
          p.barber_name || '—',
          `₹${p.upi_paid}`,
          p.notes || '—',
        ]),
        fileNamePrefix: 'SB_UPI_Collection_Report',
      };
    }

    if (selectedReportType === 'OUTSTANDING_DUES') {
      const dueCustomers = data.customers.filter((c) => Number(c.outstanding_due) > 0);
      const totalDue = dueCustomers.reduce((s, c) => s + Number(c.outstanding_due), 0);
      return {
        reportTitle: 'Customer-wise Outstanding Udhar (Due) Report',
        salonName: data.salon.name,
        dateRangeLabel: `As of ${todayStr}`,
        summaryItems: [
          { label: 'Total Outstanding Udhar', value: `₹${totalDue}` },
          { label: 'Customers with Due', value: String(dueCustomers.length) },
        ],
        headers: ['Customer Name', 'Mobile Number', 'Total Visits', 'Total Spent', 'Last Visit', 'Pending Udhar (₹)'],
        rows: dueCustomers.map((c) => [
          c.name,
          c.phone,
          c.total_visits,
          `₹${c.total_spent}`,
          c.last_visit_date || '—',
          `₹${c.outstanding_due}`,
        ]),
        fileNamePrefix: 'SB_Outstanding_Udhar_Report',
      };
    }

    if (selectedReportType === 'STAFF_COMMISSION') {
      const totalComm = data.commissions.reduce((s, c) => s + Number(c.commission_amount), 0);
      const totalServiceWork = data.commissions.reduce((s, c) => s + Number(c.service_amount), 0);
      return {
        reportTitle: 'Staff Performance & Commission Report',
        salonName: data.salon.name,
        dateRangeLabel: 'All Completed Services (Cancelled Excluded)',
        summaryItems: [
          { label: 'Total Completed Work', value: `₹${totalServiceWork}` },
          { label: 'Total Staff Commission', value: `₹${totalComm}` },
        ],
        headers: ['Date', 'Staff / Barber Name', 'Service Revenue', 'Commission %', 'Earned Commission'],
        rows: data.commissions.map((c) => [
          c.earned_date,
          c.staff_name,
          `₹${c.service_amount}`,
          `${c.commission_pct}%`,
          `₹${c.commission_amount}`,
        ]),
        fileNamePrefix: 'SB_Staff_Commission_Report',
      };
    }

    if (selectedReportType === 'SERVICE_REVENUE') {
      const completedBookings = data.bookings.filter((b) => b.status === 'COMPLETED');
      const serviceMap = new Map<string, { name: string; count: number; revenue: number }>();

      for (const b of completedBookings) {
        for (const bs of b.services || []) {
          const entry = serviceMap.get(bs.service_name) || {
            name: bs.service_name,
            count: 0,
            revenue: 0,
          };
          entry.count += 1;
          entry.revenue += Number(bs.price);
          serviceMap.set(bs.service_name, entry);
        }
      }

      const list = Array.from(serviceMap.values()).sort((a, b) => b.revenue - a.revenue);
      const totalRev = list.reduce((s, i) => s + i.revenue, 0);

      return {
        reportTitle: 'Service-wise Revenue Report',
        salonName: data.salon.name,
        dateRangeLabel: 'Completed Salon Services',
        summaryItems: [
          { label: 'Total Service Revenue', value: `₹${totalRev}` },
          { label: 'Distinct Services', value: String(list.length) },
        ],
        headers: ['Service Name', 'Times Performed', 'Total Revenue Generated'],
        rows: list.map((item) => [item.name, item.count, `₹${item.revenue}`]),
        fileNamePrefix: 'SB_Service_Revenue_Report',
      };
    }

    // EXPENSE_REPORT
    const totalExp = data.expenses.reduce((s, e) => s + Number(e.amount), 0);
    return {
      reportTitle: 'Salon Expense Report',
      salonName: data.salon.name,
      dateRangeLabel: 'All Recorded Shop Expenses',
      summaryItems: [
        { label: 'Total Expenses', value: `₹${totalExp}` },
        { label: 'Entries Count', value: String(data.expenses.length) },
      ],
      headers: ['Date', 'Expense Title', 'Category', 'Payment Mode', 'Amount (₹)', 'Notes'],
      rows: data.expenses.map((e) => [
        e.expense_date,
        e.title,
        e.category,
        e.payment_mode,
        `₹${e.amount}`,
        e.notes || '—',
      ]),
      fileNamePrefix: 'SB_Expense_Report',
    };
  }, [selectedReportType, reportReferenceDate, data, todayStr]);

  const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  return (
    <div className="space-y-6">
      {/* ==========================================================================
          TAB 1: CUSTOMERS, HAIRCUT HISTORY & UDHAR DUE LEDGER
         ========================================================================== */}
      {activeSubTab === 'CUSTOMERS' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {/* Customer Directory List */}
          <div className="lg:col-span-2 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                Customers &amp; Udhar Ledger ({data.customers.length})
              </h2>
              <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer bg-rose-500/10 text-rose-700 dark:text-rose-300 px-3 py-2 rounded-xl border border-rose-500/20">
                <input
                  type="checkbox"
                  checked={onlyWithDue}
                  onChange={(e) => setOnlyWithDue(e.target.checked)}
                  className="rounded accent-rose-600"
                />
                <span>Only Pending Udhar</span>
              </label>
            </div>

            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
              <input
                type="text"
                placeholder="Search by name or phone..."
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 pl-10 pr-4 py-2 text-sm"
              />
            </div>

            {filteredCustomers.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">
                No customers found.
              </div>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                {filteredCustomers.map((c) => (
                  <div
                    key={c.id}
                    className={`p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer transition-colors ${
                      selectedCustomer?.id === c.id
                        ? 'bg-amber-500/10'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-950'
                    }`}
                    onClick={() => setSelectedCustomer(c)}
                  >
                    <div>
                      <div className="font-bold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-2">
                        <span>{c.name}</span>
                        <span className="font-mono text-xs text-slate-500 tabular-nums">
                          +91 {c.phone}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Visits: <strong className="font-mono tabular-nums">{c.total_visits}</strong> ·
                        Total Billed: <strong className="font-mono tabular-nums">₹{c.total_spent}</strong>
                        {c.haircut_preference ? ` · Style: ${c.haircut_preference}` : ''}
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <div className="text-[11px] text-slate-500">Outstanding Udhar</div>
                        <div
                          className={`font-mono font-extrabold text-sm tabular-nums ${
                            c.outstanding_due > 0
                              ? 'text-rose-600 dark:text-rose-400'
                              : 'text-emerald-600 dark:text-emerald-400'
                          }`}
                        >
                          ₹{c.outstanding_due}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingCustomer(c);
                        }}
                        className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800"
                        title="Edit Customer"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right Panel: Selected Customer Detail, Udhar Settlement & Haircut History */}
          <div className="space-y-4">
            {editingCustomer && (
              <form
                onSubmit={handleSaveCustomerEdit}
                className="rounded-2xl bg-white dark:bg-slate-900 border border-amber-500 p-5 space-y-3"
              >
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Edit Customer Profile
                </h3>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Full Name</label>
                  <input
                    type="text"
                    required
                    value={editingCustomer.name}
                    onChange={(e) =>
                      setEditingCustomer({ ...editingCustomer, name: e.target.value })
                    }
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Mobile Number</label>
                  <input
                    type="tel"
                    required
                    value={editingCustomer.phone}
                    onChange={(e) =>
                      setEditingCustomer({ ...editingCustomer, phone: e.target.value })
                    }
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Haircut Preference</label>
                  <input
                    type="text"
                    value={editingCustomer.haircut_preference}
                    onChange={(e) =>
                      setEditingCustomer({
                        ...editingCustomer,
                        haircut_preference: e.target.value,
                      })
                    }
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Special Notes</label>
                  <input
                    type="text"
                    value={editingCustomer.special_notes}
                    onChange={(e) =>
                      setEditingCustomer({
                        ...editingCustomer,
                        special_notes: e.target.value,
                      })
                    }
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm"
                  />
                </div>
                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setEditingCustomer(null)}
                    className="px-3 py-1.5 rounded-lg border text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 rounded-lg bg-amber-500 text-slate-950 font-bold text-xs"
                  >
                    Save Changes
                  </button>
                </div>
              </form>
            )}

            {selectedCustomer ? (
              <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-5">
                <div className="border-b border-slate-200 dark:border-slate-800 pb-3">
                  <div className="text-xs text-slate-500">Customer Ledger &amp; History</div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    {selectedCustomer.name} (+91 {selectedCustomer.phone})
                  </h3>
                  <div className="text-xs text-slate-500 mt-1">
                    Style Pref: <strong>{selectedCustomer.haircut_preference || 'Not set'}</strong>
                  </div>
                </div>

                {/* Settle Pending Udhar Form */}
                {selectedCustomer.outstanding_due > 0 && (
                  <form
                    onSubmit={handleSettleDue}
                    className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-rose-700 dark:text-rose-300">
                        Collect Pending Udhar
                      </span>
                      <span className="font-mono font-extrabold text-sm text-rose-600 dark:text-rose-400 tabular-nums">
                        Due: ₹{selectedCustomer.outstanding_due}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] text-slate-500 mb-1">
                          Cash Received (₹)
                        </label>
                        <input
                          type="number"
                          min={0}
                          value={settleCash}
                          onChange={(e) => setSettleCash(Math.max(0, Number(e.target.value)))}
                          className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-500 mb-1">
                          UPI Received (₹)
                        </label>
                        <input
                          type="number"
                          min={0}
                          value={settleUpi}
                          onChange={(e) => setSettleUpi(Math.max(0, Number(e.target.value)))}
                          className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs font-mono"
                        />
                      </div>
                    </div>
                    <input
                      type="text"
                      placeholder="Settlement remark (optional)"
                      value={settleNotes}
                      onChange={(e) => setSettleNotes(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs"
                    />
                    {settleUpi > 0 && (
                      <UpiIntentLauncher
                        upiId={data.settings.upi_id}
                        merchantName={data.settings.upi_merchant_name || data.salon.name}
                        amount={settleUpi}
                        note={`Udhar Settlement - ${selectedCustomer.name}`}
                        allowQuickConfig
                        onQuickSaveUpiId={handleQuickSaveUpiId}
                      />
                    )}
                    <button
                      type="submit"
                      disabled={settlingDue}
                      className="w-full py-2 rounded-lg bg-emerald-600 text-white font-bold text-xs hover:bg-emerald-500"
                    >
                      {settlingDue
                        ? 'Recording...'
                        : `Record Udhar Payment (₹${Number(settleCash || 0) + Number(settleUpi || 0)})`}
                    </button>
                  </form>
                )}

                {/* Customer Due Ledger History */}
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100">
                    Udhar Due Ledger Entries
                  </h4>
                  {data.customerDues.filter((d) => d.customer_id === selectedCustomer.id).length ===
                  0 ? (
                    <p className="text-xs text-slate-500">No Udhar entries for this customer.</p>
                  ) : (
                    <div className="divide-y divide-slate-200 dark:divide-slate-800 max-h-48 overflow-y-auto text-xs">
                      {data.customerDues
                        .filter((d) => d.customer_id === selectedCustomer.id)
                        .reverse()
                        .map((d) => (
                          <div key={d.id} className="py-2 flex items-center justify-between">
                            <div>
                              <div className="font-semibold">
                                {d.entry_type === 'UDHAR_ADDED' ? 'Udhar Added' : 'Udhar Paid'} (
                                {d.payment_mode})
                              </div>
                              <div className="text-[11px] text-slate-500">
                                {d.entry_date} · {d.notes}
                              </div>
                            </div>
                            <div className="text-right font-mono tabular-nums">
                              <div
                                className={
                                  d.entry_type === 'UDHAR_ADDED'
                                    ? 'text-rose-600 font-bold'
                                    : 'text-emerald-600 font-bold'
                                }
                              >
                                {d.entry_type === 'UDHAR_ADDED' ? `+₹${d.amount}` : `-₹${d.amount}`}
                              </div>
                              <div className="text-[10px] text-slate-400">
                                Bal: ₹{d.balance_after}
                              </div>
                            </div>
                          </div>
                        ))}
                    </div>
                  )}
                </div>

                {/* Customer Haircut Visit History */}
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100">
                    Haircut &amp; Service History
                  </h4>
                  {data.serviceHistory.filter((h) => h.customer_id === selectedCustomer.id)
                    .length === 0 ? (
                    <p className="text-xs text-slate-500">No completed visits recorded yet.</p>
                  ) : (
                    <div className="divide-y divide-slate-200 dark:divide-slate-800 max-h-56 overflow-y-auto text-xs">
                      {data.serviceHistory
                        .filter((h) => h.customer_id === selectedCustomer.id)
                        .map((h) => (
                          <div key={h.id} className="py-2 space-y-0.5">
                            <div className="flex items-center justify-between font-semibold">
                              <span>{h.services_summary}</span>
                              <span className="font-mono text-emerald-600 tabular-nums">
                                Paid ₹{h.amount_paid} / ₹{h.total_bill}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-500">
                              Barber: {h.barber_name} · Date: {h.visit_date}
                            </div>
                            {(h.haircut_preference || h.special_notes) && (
                              <div className="text-[11px] text-amber-600 dark:text-amber-400">
                                {h.haircut_preference ? `Style: ${h.haircut_preference} ` : ''}
                                {h.special_notes ? `· Note: ${h.special_notes}` : ''}
                              </div>
                            )}
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 text-center text-xs text-slate-500">
                Select a customer
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==========================================================================
          TAB 2: DYNAMIC STAFF MANAGEMENT, COMMISSION & ATTENDANCE
         ========================================================================== */}
      {activeSubTab === 'STAFF' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          <div className="lg:col-span-2 space-y-4">
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4">
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                Salon Barbers &amp; Staff ({data.staff.length})
              </h2>

              <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                {data.staff.map((member) => {
                  const memberCommissions = data.commissions.filter(
                    (c) => c.staff_id === member.id
                  );
                  const totalEarned = memberCommissions.reduce(
                    (s, c) => s + Number(c.commission_amount),
                    0
                  );

                  return (
                    <div
                      key={member.id}
                      className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-slate-900 dark:text-slate-100">
                            {member.name}
                          </span>
                          <span className="text-xs text-slate-400">·</span>
                          <span className="font-mono text-xs text-slate-500 tabular-nums">
                            {member.phone}
                          </span>
                          {!member.is_active && (
                            <span className="text-xs text-rose-600 font-semibold">
                              (Deactivated — History Preserved)
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          {member.specialty} · Commission:{' '}
                          <strong className="font-mono tabular-nums">{member.commission_pct}%</strong>{' '}
                          · Total Commission Earned:{' '}
                          <strong className="font-mono text-emerald-600 dark:text-emerald-400 tabular-nums">
                            ₹{totalEarned}
                          </strong>{' '}
                          ({memberCommissions.length} services)
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setEditingStaff(member)}
                          className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800"
                        >
                          Edit / Commission %
                        </button>

                        {!member.is_owner && (
                          <>
                            {confirmDeactivateStaffId === member.id ? (
                              <div className="flex items-center gap-1.5 bg-rose-500/10 border border-rose-500/30 px-2.5 py-1 rounded-lg">
                                <span className="text-xs text-rose-600 font-semibold">
                                  {member.is_active ? 'Deactivate?' : 'Reactivate?'}
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleUpdateStaff({
                                      ...member,
                                      is_active: !member.is_active,
                                    })
                                  }
                                  className="px-2 py-0.5 rounded bg-rose-600 text-white text-xs font-bold"
                                >
                                  Confirm
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeactivateStaffId(null)}
                                  className="px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-xs"
                                >
                                  No
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmDeactivateStaffId(member.id)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                                  member.is_active
                                    ? 'border border-rose-500/30 text-rose-600 dark:text-rose-400'
                                    : 'bg-emerald-600 text-white'
                                }`}
                              >
                                {member.is_active ? 'Deactivate' : 'Reactivate'}
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Add or Edit Staff Sidebar */}
          <div className="space-y-4">
            {editingStaff ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleUpdateStaff(editingStaff);
                }}
                className="rounded-2xl bg-white dark:bg-slate-900 border border-amber-500 p-5 space-y-3"
              >
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Edit Staff: {editingStaff.name}
                </h3>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Full Name</label>
                  <input
                    type="text"
                    required
                    value={editingStaff.name}
                    onChange={(e) =>
                      setEditingStaff({ ...editingStaff, name: e.target.value })
                    }
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Phone Number</label>
                  <input
                    type="tel"
                    required
                    value={editingStaff.phone}
                    onChange={(e) =>
                      setEditingStaff({ ...editingStaff, phone: e.target.value })
                    }
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Role / Specialty</label>
                  <input
                    type="text"
                    value={editingStaff.specialty}
                    onChange={(e) =>
                      setEditingStaff({ ...editingStaff, specialty: e.target.value })
                    }
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">
                    Commission Percentage (%)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={editingStaff.commission_pct}
                    onChange={(e) =>
                      setEditingStaff({
                        ...editingStaff,
                        commission_pct: Number(e.target.value),
                      })
                    }
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm font-mono"
                  />
                </div>
                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setEditingStaff(null)}
                    className="px-3 py-1.5 rounded-lg border text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 rounded-lg bg-amber-500 text-slate-950 font-bold text-xs"
                  >
                    Save Staff Changes
                  </button>
                </div>
              </form>
            ) : (
              <form
                onSubmit={handleAddStaff}
                className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-3"
              >
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <UserPlus className="w-4 h-4 text-amber-500" />
                  <span>Add New Staff Member</span>
                </h3>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Staff Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g., Salman Khan"
                    value={staffName}
                    onChange={(e) => setStaffName(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Mobile Number *</label>
                  <input
                    type="tel"
                    required
                    placeholder="9876500003"
                    value={staffPhone}
                    onChange={(e) => setStaffPhone(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Specialty</label>
                  <input
                    type="text"
                    value={staffSpecialty}
                    onChange={(e) => setStaffSpecialty(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">
                    Commission Percentage (%)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={staffCommissionPct}
                    onChange={(e) => setStaffCommissionPct(Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm font-mono"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full py-2.5 rounded-xl bg-amber-500 text-slate-950 font-bold text-xs hover:bg-amber-400"
                >
                  + Add Staff Member
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ==========================================================================
          TAB 3: SERVICES & PRICES MANAGEMENT
         ========================================================================== */}
      {activeSubTab === 'SERVICES' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          <div className="lg:col-span-2 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4">
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
              Services &amp; Price Menu ({data.services.length})
            </h2>

            <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              {data.services.map((srv) => {
                const draftPrice =
                  quickPriceEdits[srv.id] !== undefined ? quickPriceEdits[srv.id] : srv.price;
                const priceChanged = draftPrice !== srv.price;
                return (
                  <div
                    key={srv.id}
                    className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div>
                      <div className="font-bold text-sm text-slate-900 dark:text-slate-100">
                        {srv.name}{' '}
                        {srv.name_hi && (
                          <span className="text-xs font-normal text-slate-500">
                            ({srv.name_hi})
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        {srv.category} · {srv.duration_minutes} mins{' '}
                        {!srv.is_active && '· (Inactive)'}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <div className="flex items-center gap-1 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-2 py-1">
                        <span className="text-xs font-bold text-slate-500">₹</span>
                        <input
                          type="number"
                          min={0}
                          value={draftPrice}
                          onChange={(e) =>
                            setQuickPriceEdits((prev) => ({
                              ...prev,
                              [srv.id]: Math.max(0, Number(e.target.value)),
                            }))
                          }
                          className="w-16 bg-transparent font-mono font-extrabold text-sm text-amber-600 dark:text-amber-400 tabular-nums focus:outline-none"
                        />
                        {priceChanged && (
                          <button
                            type="button"
                            onClick={() => handleUpdateService({ ...srv, price: draftPrice })}
                            className="px-2 py-1 rounded bg-emerald-600 text-white text-[11px] font-bold"
                          >
                            Save
                          </button>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => setEditingService(srv)}
                        className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        Full Edit
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          handleUpdateService({ ...srv, is_active: !srv.is_active })
                        }
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                          srv.is_active
                            ? 'border border-amber-500/40 text-amber-600 dark:text-amber-400'
                            : 'bg-emerald-600 text-white'
                        }`}
                      >
                        {srv.is_active ? 'Disable' : 'Enable'}
                      </button>

                      {confirmDeleteServiceId === srv.id ? (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleDeleteService(srv.id)}
                            className="px-2 py-1 rounded bg-rose-600 text-white text-xs font-bold"
                          >
                            Delete
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteServiceId(null)}
                            className="px-2 py-1 rounded bg-slate-200 dark:bg-slate-800 text-xs"
                          >
                            No
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteServiceId(srv.id)}
                          className="p-2 rounded-lg text-slate-400 hover:text-rose-600 border border-slate-200 dark:border-slate-800"
                          title="Delete Service"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Add or Edit Service Form */}
          <div>
            {editingService ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleUpdateService(editingService);
                }}
                className="rounded-2xl bg-white dark:bg-slate-900 border border-amber-500 p-5 space-y-3"
              >
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Edit Service: {editingService.name}
                </h3>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Service Name (English)</label>
                  <input
                    type="text"
                    required
                    value={editingService.name}
                    onChange={(e) =>
                      setEditingService({ ...editingService, name: e.target.value })
                    }
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Service Name (Hindi)</label>
                  <input
                    type="text"
                    value={editingService.name_hi}
                    onChange={(e) =>
                      setEditingService({ ...editingService, name_hi: e.target.value })
                    }
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Price (₹)</label>
                  <input
                    type="number"
                    min={0}
                    required
                    value={editingService.price}
                    onChange={(e) =>
                      setEditingService({
                        ...editingService,
                        price: Number(e.target.value),
                      })
                    }
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Duration (Minutes)</label>
                  <input
                    type="number"
                    min={5}
                    value={editingService.duration_minutes}
                    onChange={(e) =>
                      setEditingService({
                        ...editingService,
                        duration_minutes: Number(e.target.value),
                      })
                    }
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm font-mono"
                  />
                </div>
                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setEditingService(null)}
                    className="px-3 py-1.5 rounded-lg border text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 rounded-lg bg-amber-500 text-slate-950 font-bold text-xs"
                  >
                    Save Service
                  </button>
                </div>
              </form>
            ) : (
              <form
                onSubmit={handleAddService}
                className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-3"
              >
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Add Custom Service
                </h3>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Service Name (English) *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g., Head Massage"
                    value={serviceName}
                    onChange={(e) => setServiceName(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Service Name (Hindi)</label>
                  <input
                    type="text"
                    placeholder="e.g., हेड मसाज"
                    value={serviceNameHi}
                    onChange={(e) => setServiceNameHi(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Price (₹) *</label>
                    <input
                      type="number"
                      min={0}
                      required
                      value={servicePrice}
                      onChange={(e) => setServicePrice(Number(e.target.value))}
                      className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Duration (Mins)</label>
                    <input
                      type="number"
                      min={5}
                      value={serviceDuration}
                      onChange={(e) => setServiceDuration(Number(e.target.value))}
                      className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm font-mono"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  className="w-full py-2.5 rounded-xl bg-amber-500 text-slate-950 font-bold text-xs hover:bg-amber-400"
                >
                  + Add Service
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ==========================================================================
          TAB 4: DAILY EXPENSES MANAGEMENT
         ========================================================================== */}
      {activeSubTab === 'EXPENSES' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          <div className="lg:col-span-2 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                Daily Expenses ({data.expenses.length})
              </h2>
              <div className="text-right">
                <div className="text-xs text-slate-500">Total Expenses</div>
                <div className="font-mono text-lg font-extrabold text-amber-600 dark:text-amber-400 tabular-nums">
                  ₹{data.expenses.reduce((s, e) => s + Number(e.amount), 0)}
                </div>
              </div>
            </div>

            {data.expenses.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">
                No expenses recorded yet.
              </div>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                {data.expenses.map((exp) => (
                  <div
                    key={exp.id}
                    className="p-4 flex items-center justify-between gap-3"
                  >
                    <div>
                      <div className="font-bold text-sm text-slate-900 dark:text-slate-100">
                        {exp.title}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        {exp.category} · {exp.expense_date} · Paid via {exp.payment_mode}
                        {exp.notes ? ` · ${exp.notes}` : ''}
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="font-mono font-bold text-sm text-rose-600 dark:text-rose-400 tabular-nums">
                        -₹{exp.amount}
                      </span>
                      {confirmDeleteExpenseId === exp.id ? (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleDeleteExpense(exp.id)}
                            className="px-2 py-1 rounded bg-rose-600 text-white text-xs font-bold"
                          >
                            Delete
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteExpenseId(null)}
                            className="px-2 py-1 rounded bg-slate-200 dark:bg-slate-800 text-xs"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteExpenseId(exp.id)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600"
                          title="Delete Expense"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <form
            onSubmit={handleAddExpense}
            className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-3"
          >
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Record Shop Expense
            </h3>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Expense Title *</label>
              <input
                type="text"
                required
                placeholder="e.g., Blades & Shaving Foam, Tea, Electricity"
                value={expTitle}
                onChange={(e) => setExpTitle(e.target.value)}
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Category</label>
                <select
                  value={expCategory}
                  onChange={(e) => setExpCategory(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm"
                >
                  <option value="Shop Supplies">Shop Supplies</option>
                  <option value="Tea & Refreshments">Tea &amp; Refreshments</option>
                  <option value="Electricity & Bills">Electricity &amp; Bills</option>
                  <option value="Rent & Maintenance">Rent &amp; Maintenance</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Payment Mode</label>
                <select
                  value={expMode}
                  onChange={(e) => setExpMode(e.target.value as 'CASH' | 'UPI')}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm"
                >
                  <option value="CASH">Cash</option>
                  <option value="UPI">UPI</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Amount (₹) *</label>
                <input
                  type="number"
                  min={1}
                  required
                  value={expAmount || ''}
                  onChange={(e) => setExpAmount(Number(e.target.value))}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm font-mono"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Date</label>
                <input
                  type="date"
                  value={expDate}
                  onChange={(e) => setExpDate(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm font-mono"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Notes</label>
              <input
                type="text"
                placeholder="Optional note"
                value={expNotes}
                onChange={(e) => setExpNotes(e.target.value)}
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm"
              />
            </div>
            <button
              type="submit"
              className="w-full py-2.5 rounded-xl bg-amber-500 text-slate-950 font-bold text-xs hover:bg-amber-400"
            >
              + Save Expense
            </button>
          </form>
        </div>
      )}

      {/* ==========================================================================
          TAB 5: 9 FINANCIAL & OPERATIONAL REPORTS WITH PDF & EXCEL EXPORT
         ========================================================================== */}
      {activeSubTab === 'REPORTS' && (
        <div className="space-y-6">
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                Reports (PDF &amp; Excel)
              </h2>

              <div className="flex flex-wrap items-center gap-2.5">
                <input
                  type="date"
                  value={reportReferenceDate}
                  onChange={(e) => setReportReferenceDate(e.target.value)}
                  className="rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs font-mono"
                />
                <button
                  type="button"
                  onClick={() => exportReportToPDF(currentReportData)}
                  className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-900 dark:bg-amber-500 text-white dark:text-slate-950 font-bold text-xs hover:opacity-90 min-h-[40px]"
                >
                  <FileText className="w-4 h-4" />
                  <span>{t(lang, 'exportPDF')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => exportReportToExcel(currentReportData)}
                  className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-600 text-white font-bold text-xs hover:bg-emerald-500 min-h-[40px]"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>{t(lang, 'exportExcel')}</span>
                </button>
              </div>
            </div>

            {/* 9 Report Selector Buttons */}
            <div className="flex flex-wrap gap-2 pt-2">
              {(
                [
                  { id: 'DAILY_SALES', label: '1. Daily Sales Report' },
                  { id: 'WEEKLY_REPORT', label: '2. Weekly Report' },
                  { id: 'MONTHLY_REPORT', label: '3. Monthly Report' },
                  { id: 'CASH_COLLECTION', label: '4. Cash Collection' },
                  { id: 'UPI_COLLECTION', label: '5. UPI Collection' },
                  { id: 'OUTSTANDING_DUES', label: '6. Outstanding Dues (Udhar)' },
                  { id: 'STAFF_COMMISSION', label: '7. Staff Commission' },
                  { id: 'SERVICE_REVENUE', label: '8. Service-wise Revenue' },
                  { id: 'EXPENSE_REPORT', label: '9. Expense Report' },
                ] as { id: ReportType; label: string }[]
              ).map((rep) => (
                <button
                  key={rep.id}
                  type="button"
                  onClick={() => setSelectedReportType(rep.id)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors ${
                    selectedReportType === rep.id
                      ? 'bg-amber-500 text-slate-950 shadow-sm'
                      : 'bg-slate-100 dark:bg-slate-950 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800'
                  }`}
                >
                  {rep.label}
                </button>
              ))}
            </div>
          </div>

          {/* Active Report Preview Card */}
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  {currentReportData.reportTitle}
                </h3>
                <p className="text-xs text-slate-500 font-mono">
                  Period: {currentReportData.dateRangeLabel}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-4">
                {currentReportData.summaryItems.map((item) => (
                  <div key={item.label} className="text-right">
                    <div className="text-[11px] text-slate-500">{item.label}</div>
                    <div className="font-mono font-extrabold text-sm text-amber-600 dark:text-amber-400 tabular-nums">
                      {item.value}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {currentReportData.rows.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">
                No records found for this report period.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                      {currentReportData.headers.map((h) => (
                        <th key={h} className="py-2.5 px-3 font-semibold">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {currentReportData.rows.map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/70 dark:hover:bg-slate-950/50">
                        {row.map((cell, cIdx) => (
                          <td key={cIdx} className="py-2.5 px-3 font-mono tabular-nums">
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==========================================================================
          TAB 6: COMPLETE OWNER SETTINGS (Home Showcase, Ticker, Offers, Details, PINs)
         ========================================================================== */}
      {activeSubTab === 'SETTINGS' && (
        <div className="space-y-6">
          {/* Sub-Navigation Pills inside Settings */}
          <div className="flex flex-wrap items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-2 rounded-2xl">
            <button
              type="button"
              onClick={() => setSettingsSection('SHOWCASE')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-colors min-h-[42px] ${
                settingsSection === 'SHOWCASE'
                  ? 'bg-amber-500 text-slate-950 shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <ImagePlus className="w-4 h-4" />
              <span>Slides, Header, Footer &amp; Reviews</span>
            </button>
            <button
              type="button"
              onClick={() => setSettingsSection('GENERAL')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-colors min-h-[42px] ${
                settingsSection === 'GENERAL'
                  ? 'bg-amber-500 text-slate-950 shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Settings className="w-4 h-4" />
              <span>Salon Details, Links &amp; UPI</span>
            </button>
            <button
              type="button"
              onClick={() => setSettingsSection('SLOTS_PINS')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-colors min-h-[42px] ${
                settingsSection === 'SLOTS_PINS'
                  ? 'bg-amber-500 text-slate-950 shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <KeyRound className="w-4 h-4" />
              <span>Quick Prices, Slots &amp; PINs</span>
            </button>
          </div>

          {/* ========================================================================
              SETTINGS SUB-TAB 1: 3-4 SLIDE PHOTOS, HEADER/FOOTER, TICKER, OFFERS & REVIEWS
             ======================================================================== */}
          {settingsSection === 'SHOWCASE' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                {/* 1. 3-4 Slide Photos + Header, Banner & Footer Texts */}
                <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <ImagePlus className="w-4 h-4 text-amber-500" />
                      <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                        Home Slide Photos ({heroImagesList.length}/4)
                      </h2>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const fallback = ['/src/assets/images/salon_hero_interior_1795068719871.jpg'];
                        setHeroImagesList(fallback);
                        saveShowcaseConfig({ hero_images: fallback });
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-[11px] font-semibold hover:border-amber-500"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Reset</span>
                    </button>
                  </div>

                  {/* 1-4 Slides List */}
                  <div className="space-y-3">
                    {heroImagesList.map((imgUrl, idx) => (
                      <div
                        key={`${idx}_${imgUrl.slice(0, 24)}`}
                        className="p-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex items-center gap-3"
                      >
                        <img
                          src={imgUrl}
                          alt={`Slide ${idx + 1}`}
                          className="w-16 h-12 rounded-xl object-cover bg-slate-900 shrink-0"
                        />
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="text-[11px] font-bold text-amber-600 dark:text-amber-400">
                            Slide {idx + 1}
                          </div>
                          <input
                            type="text"
                            value={imgUrl}
                            onChange={(e) => {
                              const val = e.target.value;
                              setHeroImagesList((prev) =>
                                prev.map((item, i) => (i === idx ? val : item))
                              );
                            }}
                            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-[11px] font-mono"
                          />
                        </div>
                        <div className="flex flex-col gap-1 shrink-0">
                          <label className="px-2.5 py-1 rounded-lg bg-amber-500 text-slate-950 font-bold text-[11px] cursor-pointer text-center">
                            <span>Replace</span>
                            <input
                              type="file"
                              accept="image/*"
                              disabled={uploadingPhoto}
                              onChange={(e) => handleUploadHeroImageFile(e, idx)}
                              className="hidden"
                            />
                          </label>
                          <button
                            type="button"
                            onClick={() => handleRemoveSlide(idx)}
                            className="px-2.5 py-1 rounded-lg border border-rose-500/30 text-rose-500 text-[11px] font-semibold hover:bg-rose-500/10"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {heroImagesList.length < 4 && (
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <label className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs cursor-pointer">
                        <Upload className="w-3.5 h-3.5" />
                        <span>{uploadingPhoto ? 'Uploading...' : '+ Upload Slide Photo'}</span>
                        <input
                          type="file"
                          accept="image/*"
                          disabled={uploadingPhoto}
                          onChange={(e) => handleUploadHeroImageFile(e)}
                          className="hidden"
                        />
                      </label>
                      <form onSubmit={handleAddSlideUrl} className="flex-1 flex gap-1.5 min-w-[200px]">
                        <input
                          type="text"
                          placeholder="Or paste photo URL..."
                          value={newSlideUrl}
                          onChange={(e) => setNewSlideUrl(e.target.value)}
                          className="flex-1 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs font-mono"
                        />
                        <button
                          type="submit"
                          className="px-3 py-2 rounded-xl bg-slate-900 dark:bg-slate-800 text-white text-xs font-bold"
                        >
                          Add
                        </button>
                      </form>
                    </div>
                  )}

                  {/* Header, Banner & Footer Texts */}
                  <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
                    <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
                      Header, Banner &amp; Footer Branding
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">
                          Header &amp; Footer Salon Name
                        </label>
                        <input
                          type="text"
                          value={salonName}
                          onChange={(e) => setSalonName(e.target.value)}
                          className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm font-bold"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">
                          Top Badge Text
                        </label>
                        <input
                          type="text"
                          placeholder="Gents Salon & Grooming"
                          value={heroBadgeInput}
                          onChange={(e) => setHeroBadgeInput(e.target.value)}
                          className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">
                          Home Main Heading
                        </label>
                        <input
                          type="text"
                          placeholder={data.salon.name}
                          value={heroTitleInput}
                          onChange={(e) => setHeroTitleInput(e.target.value)}
                          className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">
                          Footer Credit Name
                        </label>
                        <input
                          type="text"
                          placeholder="Mirza Saif"
                          value={developerCreditInput}
                          onChange={(e) => setDeveloperCreditInput(e.target.value)}
                          className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">
                        Home Subtitle
                      </label>
                      <input
                        type="text"
                        placeholder="Haircuts, Beard Styling & Grooming"
                        value={heroSubtitleInput}
                        onChange={(e) => setHeroSubtitleInput(e.target.value)}
                        className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">
                        Footer Tagline (Optional)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g., Best Gents Grooming & Hair Studio"
                        value={footerTaglineInput}
                        onChange={(e) => setFooterTaglineInput(e.target.value)}
                        className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm"
                      />
                    </div>

                    <button
                      type="button"
                      disabled={savingShowcase}
                      onClick={() => saveShowcaseConfig()}
                      className="w-full py-2.5 rounded-xl bg-slate-900 dark:bg-amber-500 text-white dark:text-slate-950 font-bold text-xs hover:opacity-90"
                    >
                      {savingShowcase ? 'Saving...' : 'Save Slides, Header & Footer'}
                    </button>
                  </div>

                  {/* Highlight Points (Add / Edit / Toggle / Delete) */}
                  <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-slate-100">
                      <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                      <span>Feature Highlights</span>
                    </div>
                    <form onSubmit={handleAddHighlight} className="flex gap-2">
                      <input
                        type="text"
                        placeholder="e.g., AC Salon · Free Wi-Fi · Hygienic Tools"
                        value={newHighlightText}
                        onChange={(e) => setNewHighlightText(e.target.value)}
                        className="flex-1 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs"
                      />
                      <button
                        type="submit"
                        className="px-3.5 py-2 rounded-xl bg-amber-500 text-slate-950 font-bold text-xs flex items-center gap-1"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add</span>
                      </button>
                    </form>

                    <div className="space-y-2">
                      {heroHighlights.map((hl) => (
                        <div
                          key={hl.id}
                          className="flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-2"
                        >
                          <input
                            type="text"
                            value={hl.text}
                            onChange={(e) =>
                              setHeroHighlights((prev) =>
                                prev.map((item) =>
                                  item.id === hl.id ? { ...item, text: e.target.value } : item
                                )
                              )
                            }
                            className="flex-1 bg-transparent text-xs font-medium px-2 py-1 focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const next = heroHighlights.map((item) =>
                                item.id === hl.id ? { ...item, is_active: !item.is_active } : item
                              );
                              setHeroHighlights(next);
                              saveShowcaseConfig({ hero_highlights: next });
                            }}
                            className={`p-1.5 rounded-lg text-xs ${
                              hl.is_active ? 'text-emerald-600' : 'text-slate-400'
                            }`}
                            title={hl.is_active ? 'Visible on Home' : 'Hidden'}
                          >
                            {hl.is_active ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                          </button>
                          <button
                            type="button"
                            onClick={() => saveShowcaseConfig({ hero_highlights: heroHighlights })}
                            className="px-2 py-1 rounded-lg bg-emerald-600 text-white text-[11px] font-bold"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const next = heroHighlights.filter((item) => item.id !== hl.id);
                              setHeroHighlights(next);
                              saveShowcaseConfig({ hero_highlights: next });
                            }}
                            className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-500/10"
                            title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* 2. Live Running Ticker + Customer Offer Popup Manager */}
                <div className="space-y-6">
                  {/* Live Running Ticker */}
                  <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Megaphone className="w-4 h-4 text-amber-500" />
                        <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                          Live Running Ticker (Scrolling Strip)
                        </h2>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const nextVal = !tickerEnabled;
                          setTickerEnabled(nextVal);
                          saveShowcaseConfig({ ticker_enabled: nextVal });
                        }}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold ${
                          tickerEnabled
                            ? 'bg-emerald-600 text-white'
                            : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        {tickerEnabled ? 'Ticker ON' : 'Ticker OFF'}
                      </button>
                    </div>

                    <form onSubmit={handleAddTickerItem} className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Add scrolling message (e.g., Sunday Special Haircut + Beard ₹200)"
                        value={newTickerText}
                        onChange={(e) => setNewTickerText(e.target.value)}
                        className="flex-1 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs"
                      />
                      <button
                        type="submit"
                        className="px-3.5 py-2 rounded-xl bg-amber-500 text-slate-950 font-bold text-xs flex items-center gap-1"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add</span>
                      </button>
                    </form>

                    <div className="space-y-2 max-h-56 overflow-y-auto">
                      {tickerItems.map((tk) => (
                        <div
                          key={tk.id}
                          className="flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-2"
                        >
                          <input
                            type="text"
                            value={tk.text}
                            onChange={(e) =>
                              setTickerItems((prev) =>
                                prev.map((item) =>
                                  item.id === tk.id ? { ...item, text: e.target.value } : item
                                )
                              )
                            }
                            className="flex-1 bg-transparent text-xs font-medium px-2 py-1 focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const next = tickerItems.map((item) =>
                                item.id === tk.id ? { ...item, is_active: !item.is_active } : item
                              );
                              setTickerItems(next);
                              saveShowcaseConfig({ ticker_items: next });
                            }}
                            className={`p-1.5 rounded-lg text-xs ${
                              tk.is_active ? 'text-emerald-600' : 'text-slate-400'
                            }`}
                          >
                            {tk.is_active ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                          </button>
                          <button
                            type="button"
                            onClick={() => saveShowcaseConfig({ ticker_items: tickerItems })}
                            className="px-2 py-1 rounded-lg bg-emerald-600 text-white text-[11px] font-bold"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const next = tickerItems.filter((item) => item.id !== tk.id);
                              setTickerItems(next);
                              saveShowcaseConfig({ ticker_items: next });
                            }}
                            className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-500/10"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Customer Offers & Popup Manager */}
                  <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-4">
                    <div className="flex items-center gap-2">
                      <Gift className="w-4 h-4 text-amber-500" />
                      <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                        Customer Offer Popups ({(data.showcase?.offers || []).length})
                      </h2>
                    </div>

                    {editingOffer ? (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          handleUpdateOffer(editingOffer);
                        }}
                        className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/40 space-y-3"
                      >
                        <div className="text-xs font-bold text-amber-700 dark:text-amber-300">
                          Edit Offer
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <input
                            type="text"
                            required
                            placeholder="Offer Title"
                            value={editingOffer.title}
                            onChange={(e) =>
                              setEditingOffer({ ...editingOffer, title: e.target.value })
                            }
                            className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs"
                          />
                          <input
                            type="text"
                            placeholder="Badge (e.g., 20% OFF)"
                            value={editingOffer.badge}
                            onChange={(e) =>
                              setEditingOffer({ ...editingOffer, badge: e.target.value })
                            }
                            className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs"
                          />
                        </div>
                        <input
                          type="text"
                          placeholder="Offer description"
                          value={editingOffer.description}
                          onChange={(e) =>
                            setEditingOffer({ ...editingOffer, description: e.target.value })
                          }
                          className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs"
                        />
                        <div className="grid grid-cols-2 gap-2 items-center">
                          <input
                            type="text"
                            placeholder="Valid till (e.g., Sunday)"
                            value={editingOffer.valid_until || ''}
                            onChange={(e) =>
                              setEditingOffer({ ...editingOffer, valid_until: e.target.value })
                            }
                            className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs"
                          />
                          <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                            <input
                              type="checkbox"
                              checked={editingOffer.show_popup}
                              onChange={(e) =>
                                setEditingOffer({
                                  ...editingOffer,
                                  show_popup: e.target.checked,
                                })
                              }
                              className="rounded accent-amber-500"
                            />
                            <span>Show Auto-Popup</span>
                          </label>
                        </div>
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setEditingOffer(null)}
                            className="px-3 py-1.5 rounded-lg border text-xs"
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            className="px-4 py-1.5 rounded-lg bg-amber-500 text-slate-950 font-bold text-xs"
                          >
                            Save Offer
                          </button>
                        </div>
                      </form>
                    ) : (
                      <form onSubmit={handleAddOffer} className="space-y-2.5">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <input
                            type="text"
                            required
                            placeholder="Offer Title (e.g., Combo Cut + Beard ₹220)"
                            value={offerTitle}
                            onChange={(e) => setOfferTitle(e.target.value)}
                            className="rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs"
                          />
                          <input
                            type="text"
                            placeholder="Badge (e.g., FESTIVE DEAL)"
                            value={offerBadge}
                            onChange={(e) => setOfferBadge(e.target.value)}
                            className="rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs"
                          />
                        </div>
                        <input
                          type="text"
                          placeholder="Offer description shown inside Customer Popup..."
                          value={offerDesc}
                          onChange={(e) => setOfferDesc(e.target.value)}
                          className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs"
                        />
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <input
                            type="text"
                            placeholder="Valid till (optional)"
                            value={offerValidUntil}
                            onChange={(e) => setOfferValidUntil(e.target.value)}
                            className="flex-1 min-w-[140px] rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs"
                          />
                          <label className="flex items-center gap-1.5 text-xs font-semibold cursor-pointer px-2">
                            <input
                              type="checkbox"
                              checked={offerShowPopup}
                              onChange={(e) => setOfferShowPopup(e.target.checked)}
                              className="rounded accent-amber-500"
                            />
                            <span>Auto Popup</span>
                          </label>
                          <button
                            type="submit"
                            className="px-4 py-2 rounded-xl bg-amber-500 text-slate-950 font-bold text-xs hover:bg-amber-400 flex items-center gap-1"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Add Offer</span>
                          </button>
                        </div>
                      </form>
                    )}

                    <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                      {(data.showcase?.offers || []).length === 0 ? (
                        <div className="p-4 text-center text-xs text-slate-500">
                          No offers added yet.
                        </div>
                      ) : (
                        (data.showcase?.offers || []).map((offer) => (
                          <div
                            key={offer.id}
                            className="p-3 flex items-start justify-between gap-3 text-xs"
                          >
                            <div className="space-y-0.5 min-w-0">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-300 font-bold text-[10px]">
                                  <Tag className="w-3 h-3" />
                                  {offer.badge}
                                </span>
                                <span className="font-bold text-sm text-slate-900 dark:text-slate-100">
                                  {offer.title}
                                </span>
                                {!offer.is_active && (
                                  <span className="text-[10px] text-rose-500 font-bold">(Hidden)</span>
                                )}
                              </div>
                              {offer.description && (
                                <div className="text-slate-500 dark:text-slate-400">
                                  {offer.description}
                                </div>
                              )}
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={() =>
                                  handleUpdateOffer({ ...offer, is_active: !offer.is_active })
                                }
                                className={`p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 ${
                                  offer.is_active ? 'text-emerald-600' : 'text-slate-400'
                                }`}
                                title={offer.is_active ? 'Active' : 'Hidden'}
                              >
                                {offer.is_active ? (
                                  <Eye className="w-3.5 h-3.5" />
                                ) : (
                                  <EyeOff className="w-3.5 h-3.5" />
                                )}
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingOffer(offer)}
                                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-amber-500"
                                title="Edit Offer"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteOffer(offer.id)}
                                className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-500/10"
                                title="Delete Offer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Customer Reviews Manager (Edit / Show-Hide / Delete) */}
                  <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-4">
                    <div className="flex items-center gap-2">
                      <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
                      <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                        Customer Reviews ({(data.reviews || []).length})
                      </h2>
                    </div>

                    {editingReview && (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          handleUpdateReview(editingReview);
                        }}
                        className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/40 space-y-3"
                      >
                        <div className="text-xs font-bold text-amber-700 dark:text-amber-300">
                          Edit Review
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <input
                            type="text"
                            required
                            placeholder="Customer Name"
                            value={editingReview.customer_name}
                            onChange={(e) =>
                              setEditingReview({ ...editingReview, customer_name: e.target.value })
                            }
                            className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs"
                          />
                          <select
                            value={editingReview.rating}
                            onChange={(e) =>
                              setEditingReview({ ...editingReview, rating: Number(e.target.value) })
                            }
                            className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-mono"
                          >
                            {[5, 4, 3, 2, 1].map((r) => (
                              <option key={r} value={r}>
                                {r} Stars
                              </option>
                            ))}
                          </select>
                        </div>
                        <input
                          type="text"
                          placeholder="Service (optional)"
                          value={editingReview.service_name || ''}
                          onChange={(e) =>
                            setEditingReview({ ...editingReview, service_name: e.target.value })
                          }
                          className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs"
                        />
                        <textarea
                          rows={2}
                          required
                          value={editingReview.comment}
                          onChange={(e) =>
                            setEditingReview({ ...editingReview, comment: e.target.value })
                          }
                          className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs"
                        />
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setEditingReview(null)}
                            className="px-3 py-1.5 rounded-lg border text-xs"
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            className="px-4 py-1.5 rounded-lg bg-amber-500 text-slate-950 font-bold text-xs"
                          >
                            Save Review
                          </button>
                        </div>
                      </form>
                    )}

                    {(data.reviews || []).length === 0 ? (
                      <div className="p-4 text-center text-xs text-slate-500 border border-slate-200 dark:border-slate-800 rounded-xl">
                        No customer reviews yet.
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden max-h-72 overflow-y-auto">
                        {(data.reviews || []).map((rev) => (
                          <div
                            key={rev.id}
                            className="p-3 flex items-start justify-between gap-3 text-xs"
                          >
                            <div className="space-y-0.5 min-w-0">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="font-bold text-sm text-slate-900 dark:text-slate-100">
                                  {rev.customer_name}
                                </span>
                                <span className="font-mono text-amber-500 font-bold">
                                  {rev.rating}★
                                </span>
                                {!rev.is_visible && (
                                  <span className="text-[10px] text-rose-500 font-bold">(Hidden)</span>
                                )}
                              </div>
                              <div className="text-slate-600 dark:text-slate-300">{rev.comment}</div>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={() =>
                                  handleUpdateReview({ ...rev, is_visible: !rev.is_visible })
                                }
                                className={`p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 ${
                                  rev.is_visible ? 'text-emerald-600' : 'text-slate-400'
                                }`}
                                title={rev.is_visible ? 'Visible' : 'Hidden'}
                              >
                                {rev.is_visible ? (
                                  <Eye className="w-3.5 h-3.5" />
                                ) : (
                                  <EyeOff className="w-3.5 h-3.5" />
                                )}
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingReview(rev)}
                                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-amber-500"
                                title="Edit Review"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteReview(rev.id)}
                                className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-500/10"
                                title="Delete Review"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================
              SETTINGS SUB-TAB 2: SALON DETAILS, SEPARATE LINKS & UPI
             ======================================================================== */}
          {settingsSection === 'GENERAL' && (
            <div className="space-y-6">
              <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <Link2 className="w-4 h-4 text-amber-500" />
                  <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    Portal Links (Customer, Staff &amp; Owner)
                  </h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {[
                    {
                      key: 'customer',
                      label: 'Customer Booking Link',
                      url: typeof window !== 'undefined' ? `${window.location.origin}/` : '/',
                    },
                    {
                      key: 'staff',
                      label: 'Staff Portal Link (PIN Protected)',
                      url:
                        typeof window !== 'undefined'
                          ? `${window.location.origin}/?portal=staff`
                          : '/?portal=staff',
                    },
                    {
                      key: 'owner',
                      label: 'Owner Dashboard Link (PIN Protected)',
                      url:
                        typeof window !== 'undefined'
                          ? `${window.location.origin}/?portal=owner`
                          : '/?portal=owner',
                    },
                  ].map((item) => (
                    <div
                      key={item.key}
                      className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-bold">{item.label}</div>
                        <div className="text-[11px] font-mono text-slate-500 truncate">{item.url}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCopyPortalLink(item.key, item.url)}
                        className="px-3 py-1.5 rounded-lg bg-amber-500 text-slate-950 font-bold text-xs shrink-0 flex items-center gap-1"
                      >
                        {copiedLinkKey === item.key ? (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            <span>Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <form
                onSubmit={handleSaveSettings}
                className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-4 max-w-2xl"
              >
                <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                  Salon Details, Timings, Holidays &amp; UPI
                </h2>

                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Salon Name</label>
                  <input
                    type="text"
                    required
                    value={salonName}
                    onChange={(e) => setSalonName(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">
                      Contact Phone Number
                    </label>
                    <input
                      type="tel"
                      required
                      value={salonPhone}
                      onChange={(e) => setSalonPhone(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">
                      Slot Interval (Minutes)
                    </label>
                    <select
                      value={slotDuration}
                      onChange={(e) => setSlotDuration(Number(e.target.value))}
                      className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm font-mono"
                    >
                      <option value={15}>15 Minutes</option>
                      <option value={30}>30 Minutes</option>
                      <option value={45}>45 Minutes</option>
                      <option value={60}>60 Minutes</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Salon Address</label>
                  <input
                    type="text"
                    required
                    value={salonAddress}
                    onChange={(e) => setSalonAddress(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">
                      Opening Time
                    </label>
                    <input
                      type="time"
                      value={openingTime}
                      onChange={(e) => setOpeningTime(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">
                      Closing Time
                    </label>
                    <input
                      type="time"
                      value={closingTime}
                      onChange={(e) => setClosingTime(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1.5">
                    Weekly Holidays (Closed Days)
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {weekdays.map((day) => {
                      const active = weeklyHolidays.includes(day);
                      return (
                        <button
                          key={day}
                          type="button"
                          onClick={() =>
                            setWeeklyHolidays((prev) =>
                              prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
                            )
                          }
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${
                            active
                              ? 'bg-rose-600 text-white border-rose-600'
                              : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          {day}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20 space-y-3">
                  <div className="text-xs font-bold text-blue-700 dark:text-blue-300">
                    UPI Deep Linking / Direct Payment App Settings
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">
                        Salon UPI ID (VPA)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g., 9876543210@ybl or sbsalon@okicici"
                        value={upiId}
                        onChange={(e) => setUpiId(e.target.value)}
                        className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">
                        UPI Merchant / Payee Name
                      </label>
                      <input
                        type="text"
                        placeholder="SB Gents Salon"
                        value={upiMerchantName}
                        onChange={(e) => setUpiMerchantName(e.target.value)}
                        className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                      />
                    </div>
                  </div>
                </div>

                <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={regenerateSlots}
                    onChange={(e) => setRegenerateSlots(e.target.checked)}
                    className="rounded accent-amber-500"
                  />
                  <span>Regenerate booking time slots</span>
                </label>

                <button
                  type="submit"
                  className="w-full py-3 rounded-xl bg-amber-500 text-slate-950 font-bold text-sm hover:bg-amber-400"
                >
                  Save Salon Settings
                </button>
              </form>
            </div>
          )}

          {/* ========================================================================
              SETTINGS SUB-TAB 3: QUICK PRICES, TIME SLOTS & SECURITY PINS
             ======================================================================== */}
          {settingsSection === 'SLOTS_PINS' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
              {/* Quick Services Price, Add & Delete Control */}
              <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    Quick Edit Services &amp; Prices ({data.services.length})
                  </h2>
                  {setActiveSubTab && (
                    <button
                      type="button"
                      onClick={() => setActiveSubTab('SERVICES')}
                      className="text-xs font-bold text-amber-600 dark:text-amber-400 hover:underline shrink-0"
                    >
                      Full Menu &rarr;
                    </button>
                  )}
                </div>

                <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden max-h-64 overflow-y-auto">
                  {data.services.map((srv) => {
                    const draftPrice =
                      quickPriceEdits[srv.id] !== undefined ? quickPriceEdits[srv.id] : srv.price;
                    const changed = draftPrice !== srv.price;
                    return (
                      <div key={srv.id} className="p-3 flex items-center justify-between gap-2 text-xs">
                        <div className="min-w-0">
                          <div className="font-bold truncate">{srv.name}</div>
                          <div className="text-[11px] text-slate-500">
                            {srv.duration_minutes}m {!srv.is_active && '· Inactive'}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-slate-400 font-bold">₹</span>
                          <input
                            type="number"
                            min={0}
                            value={draftPrice}
                            onChange={(e) =>
                              setQuickPriceEdits((prev) => ({
                                ...prev,
                                [srv.id]: Math.max(0, Number(e.target.value)),
                              }))
                            }
                            className="w-16 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2 py-1 font-mono font-bold text-xs"
                          />
                          {changed && (
                            <button
                              type="button"
                              onClick={() => handleUpdateService({ ...srv, price: draftPrice })}
                              className="px-2 py-1 rounded-lg bg-emerald-600 text-white font-bold text-[11px]"
                            >
                              Save
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleDeleteService(srv.id)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600"
                            title="Delete or deactivate service"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Quick Add Service Inline */}
                <form onSubmit={handleAddService} className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                  <input
                    type="text"
                    required
                    placeholder="New Service Name"
                    value={serviceName}
                    onChange={(e) => setServiceName(e.target.value)}
                    className="rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs"
                  />
                  <input
                    type="number"
                    min={0}
                    required
                    placeholder="Price ₹"
                    value={servicePrice}
                    onChange={(e) => setServicePrice(Number(e.target.value))}
                    className="rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs font-mono"
                  />
                  <button
                    type="submit"
                    className="py-2 px-3 rounded-xl bg-amber-500 text-slate-950 font-bold text-xs hover:bg-amber-400 flex items-center justify-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Service</span>
                  </button>
                </form>
              </div>

              <div className="space-y-6">
                {/* Manage Booking Time Slots */}
                <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-4">
                  <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    Manage Time Slots ({data.timeSlots.length})
                  </h2>

                  <form onSubmit={handleAddCustomSlot} className="flex items-center gap-2">
                    <input
                      type="time"
                      required
                      value={customSlotTime}
                      onChange={(e) => setCustomSlotTime(e.target.value)}
                      className="flex-1 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs font-mono"
                    />
                    <button
                      type="submit"
                      className="px-4 py-2 rounded-xl bg-amber-500 text-slate-950 font-bold text-xs hover:bg-amber-400 flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Slot</span>
                    </button>
                  </form>

                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {data.timeSlots.map((slot) => (
                      <div
                        key={slot.id}
                        className={`flex items-center justify-between rounded-xl border px-2.5 py-2 font-mono text-xs font-semibold tabular-nums ${
                          slot.is_enabled
                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400'
                            : 'bg-slate-100 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-400'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => handleToggleSlot(slot.id, !slot.is_enabled)}
                          className={`flex-1 text-left ${!slot.is_enabled ? 'line-through' : ''}`}
                        >
                          {slot.slot_time}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteSlot(slot.id)}
                          className="p-0.5 text-slate-400 hover:text-rose-500 ml-1"
                          title="Delete Slot"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Portal Login PIN Security */}
                <form
                  onSubmit={handleSavePortalPins}
                  className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-4"
                >
                  <div className="flex items-center gap-2">
                    <KeyRound className="w-4 h-4 text-amber-500" />
                    <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                      Owner &amp; Staff Login PINs
                    </h2>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">New Owner PIN</label>
                      <input
                        type="password"
                        inputMode="numeric"
                        placeholder="Min 4 digits"
                        value={newOwnerPin}
                        onChange={(e) => setNewOwnerPin(e.target.value)}
                        className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">New Staff PIN</label>
                      <input
                        type="password"
                        inputMode="numeric"
                        placeholder="Min 4 digits"
                        value={newStaffPin}
                        onChange={(e) => setNewStaffPin(e.target.value)}
                        className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm font-mono"
                      />
                    </div>
                  </div>
                  <button
                    type="submit"
                    className="w-full py-2.5 rounded-xl bg-slate-900 dark:bg-slate-800 text-white font-bold text-xs hover:opacity-90"
                  >
                    Update Portal PINs
                  </button>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ==========================================================================
          TAB 7: DEDICATED UDHAR / DUE MANAGEMENT & COLLECTION LEDGER
         ========================================================================== */}
      {activeSubTab === 'UDHAR' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4">
              <div className="text-xs text-slate-500">Total Outstanding Udhar</div>
              <div className="font-mono text-2xl font-extrabold text-rose-600 dark:text-rose-400 mt-1 tabular-nums">
                ₹{data.customers.reduce((sum, c) => sum + Number(c.outstanding_due || 0), 0)}
              </div>
              <div className="text-xs text-slate-500 mt-1">Pending across all customers</div>
            </div>
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4">
              <div className="text-xs text-slate-500">Customers with Pending Due</div>
              <div className="font-mono text-2xl font-extrabold mt-1 tabular-nums">
                {data.customers.filter((c) => Number(c.outstanding_due) > 0).length}
              </div>
              <div className="text-xs text-slate-500 mt-1">Tap any customer to collect</div>
            </div>
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4">
              <div className="text-xs text-slate-500">Udhar Collected Today</div>
              <div className="font-mono text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-1 tabular-nums">
                ₹
                {data.customerDues
                  .filter((d) => d.entry_type === 'UDHAR_PAID' && d.entry_date === todayStr)
                  .reduce((s, d) => s + Number(d.amount), 0)}
              </div>
              <div className="text-xs text-slate-500 mt-1">Cash + UPI settlements today</div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            <div className="lg:col-span-2 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4">
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                Customers with Pending Udhar / Due
              </h2>

              {data.customers.filter((c) => Number(c.outstanding_due) > 0).length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-500 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                  Zero pending dues! All customer Udhar accounts are settled.
                </div>
              ) : (
                <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                  {data.customers
                    .filter((c) => Number(c.outstanding_due) > 0)
                    .sort((a, b) => Number(b.outstanding_due) - Number(a.outstanding_due))
                    .map((c) => (
                      <div
                        key={c.id}
                        className={`p-4 flex items-center justify-between gap-3 cursor-pointer ${
                          selectedCustomer?.id === c.id
                            ? 'bg-rose-500/10'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-950'
                        }`}
                        onClick={() => {
                          setSelectedCustomer(c);
                          setSettleCash(c.outstanding_due);
                          setSettleUpi(0);
                        }}
                      >
                        <div>
                          <div className="font-bold text-sm">
                            {c.name}{' '}
                            <span className="font-mono text-xs text-slate-500">+91 {c.phone}</span>
                          </div>
                          <div className="text-xs text-slate-500">
                            Last Visit: {c.last_visit_date || '—'} · Total Visits: {c.total_visits}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="font-mono font-extrabold text-base text-rose-600 dark:text-rose-400 tabular-nums">
                            ₹{c.outstanding_due}
                          </div>
                          <span className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold">
                            Collect
                          </span>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>

            <div className="space-y-4">
              {selectedCustomer && selectedCustomer.outstanding_due > 0 ? (
                <form
                  onSubmit={handleSettleDue}
                  className="rounded-2xl bg-white dark:bg-slate-900 border border-rose-500/40 p-5 space-y-4"
                >
                  <div>
                    <div className="text-xs text-slate-500">Collecting Udhar From</div>
                    <h3 className="text-base font-bold">{selectedCustomer.name}</h3>
                    <div className="font-mono text-lg font-extrabold text-rose-600 dark:text-rose-400 mt-1 tabular-nums">
                      Pending Due: ₹{selectedCustomer.outstanding_due}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Cash (₹)</label>
                      <input
                        type="number"
                        min={0}
                        value={settleCash}
                        onChange={(e) => setSettleCash(Math.max(0, Number(e.target.value)))}
                        className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm font-mono font-bold"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">UPI (₹)</label>
                      <input
                        type="number"
                        min={0}
                        value={settleUpi}
                        onChange={(e) => setSettleUpi(Math.max(0, Number(e.target.value)))}
                        className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm font-mono font-bold"
                      />
                    </div>
                  </div>
                  <input
                    type="text"
                    placeholder="Optional note"
                    value={settleNotes}
                    onChange={(e) => setSettleNotes(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs"
                  />
                  {settleUpi > 0 && (
                    <UpiIntentLauncher
                      upiId={data.settings.upi_id}
                      merchantName={data.settings.upi_merchant_name || data.salon.name}
                      amount={settleUpi}
                      note={`Udhar Settlement - ${selectedCustomer.name}`}
                      allowQuickConfig
                      onQuickSaveUpiId={handleQuickSaveUpiId}
                    />
                  )}
                  <button
                    type="submit"
                    disabled={settlingDue}
                    className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs"
                  >
                    {settlingDue
                      ? 'Saving...'
                      : `Collect ₹${Number(settleCash || 0) + Number(settleUpi || 0)}`}
                  </button>
                </form>
              ) : (
                <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 text-xs text-slate-500 text-center">
                  Select a customer with pending Udhar on the left to record a Cash or UPI settlement.
                </div>
              )}

              <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-3">
                <h3 className="text-sm font-bold">Recent Udhar Ledger Activity</h3>
                <div className="divide-y divide-slate-200 dark:divide-slate-800 max-h-64 overflow-y-auto text-xs">
                  {data.customerDues.slice(-10).reverse().map((d) => (
                    <div key={d.id} className="py-2 flex items-center justify-between">
                      <div>
                        <div className="font-semibold">{d.customer_name}</div>
                        <div className="text-[11px] text-slate-500">
                          {d.entry_date} · {d.entry_type === 'UDHAR_ADDED' ? 'Added' : `Paid (${d.payment_mode})`}
                        </div>
                      </div>
                      <span
                        className={`font-mono font-bold tabular-nums ${
                          d.entry_type === 'UDHAR_ADDED' ? 'text-rose-600' : 'text-emerald-600'
                        }`}
                      >
                        {d.entry_type === 'UDHAR_ADDED' ? `+₹${d.amount}` : `-₹${d.amount}`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==========================================================================
          TAB 8: DEDICATED STAFF COMMISSION MANAGEMENT & LOG
         ========================================================================== */}
      {activeSubTab === 'COMMISSION' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4">
              <div className="text-xs text-slate-500">Today&apos;s Total Staff Commission</div>
              <div className="font-mono text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-1 tabular-nums">
                ₹
                {data.commissions
                  .filter((c) => c.earned_date === todayStr)
                  .reduce((s, c) => s + Number(c.commission_amount), 0)}
              </div>
            </div>
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4">
              <div className="text-xs text-slate-500">All-Time Commission Earned</div>
              <div className="font-mono text-2xl font-extrabold mt-1 tabular-nums">
                ₹{data.commissions.reduce((s, c) => s + Number(c.commission_amount), 0)}
              </div>
            </div>
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4">
              <div className="text-xs text-slate-500">Completed Services Logged</div>
              <div className="font-mono text-2xl font-extrabold mt-1 tabular-nums">
                {data.commissions.length}
              </div>
              <div className="text-xs text-slate-500 mt-1">Cancelled bookings excluded</div>
            </div>
          </div>

          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4">
            <h2 className="text-lg font-bold">Staff-wise Commission Summary</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs sm:text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                    <th className="py-2.5 px-3">Staff / Barber</th>
                    <th className="py-2.5 px-3 text-right">Configured Rate</th>
                    <th className="py-2.5 px-3 text-right">Completed Jobs</th>
                    <th className="py-2.5 px-3 text-right">Total Service Revenue</th>
                    <th className="py-2.5 px-3 text-right">Total Commission Earned</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {data.staff.map((m) => {
                    const list = data.commissions.filter((c) => c.staff_id === m.id);
                    const rev = list.reduce((s, c) => s + Number(c.service_amount), 0);
                    const comm = list.reduce((s, c) => s + Number(c.commission_amount), 0);
                    return (
                      <tr key={m.id}>
                        <td className="py-3 px-3 font-bold">
                          {m.name} {!m.is_active && <span className="text-xs text-rose-500">(Deactivated)</span>}
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums">{m.commission_pct}%</td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums">{list.length}</td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums">₹{rev}</td>
                        <td className="py-3 px-3 text-right font-mono font-extrabold text-emerald-600 dark:text-emerald-400 tabular-nums">
                          ₹{comm}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4">
            <h3 className="text-base font-bold">Per-Service Commission Ledger</h3>
            {data.commissions.length === 0 ? (
              <p className="text-xs text-slate-500">No commissions yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                      <th className="py-2 px-3">Date</th>
                      <th className="py-2 px-3">Barber Name</th>
                      <th className="py-2 px-3 text-right">Service Amount</th>
                      <th className="py-2 px-3 text-right">Rate %</th>
                      <th className="py-2 px-3 text-right">Commission</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {data.commissions.slice().reverse().map((c) => (
                      <tr key={c.id}>
                        <td className="py-2.5 px-3 font-mono tabular-nums">{c.earned_date}</td>
                        <td className="py-2.5 px-3 font-semibold">{c.staff_name}</td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums">₹{c.service_amount}</td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums">{c.commission_pct}%</td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                          ₹{c.commission_amount}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
