'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {
  Stethoscope,
  LogOut,
  Search,
  CheckCircle2,
  Clock,
  UserCheck,
  Megaphone,
  Printer,
  Calendar,
  AlertCircle,
  RefreshCw,
  ArrowRightLeft,
  UserPlus,
  Settings,
  History,
  Volume2,
  ExternalLink,
  Sliders,
  Check,
  X,
  Shield,
  Building,
  Globe,
  Plus,
  Trash2,
  CalendarX,
  CalendarDays,
  XCircle,
  Phone,
} from 'lucide-react';
import CmsDashboard from '@/components/cms/CmsDashboard';
import { Appointment, Clinic, ClinicService, ClinicScheduleException, AppointmentStatus, AuditLogItem, CancellationRequest } from '@/types';
import { getStatusDisplay, formatArabicDate, formatLocalDate } from '@/lib/rules';

export default function StaffDashboardPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<{
    id: string;
    name: string;
    role: string;
    clinicId?: string;
  } | null>(null);

  // Active Tab
  const [activeTab, setActiveTab] = useState<'QUEUE' | 'CLINICS' | 'AUDIT' | 'CMS' | 'CANCELLATIONS'>('QUEUE');

  // Appointments & Clinics State
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [loading, setLoading] = useState(true);

  // Cancellation Requests State
  const [cancellationRequests, setCancellationRequests] = useState<CancellationRequest[]>([]);
  const [loadingCancellationRequests, setLoadingCancellationRequests] = useState(false);
  const [cancellationFilterStatus, setCancellationFilterStatus] = useState<string>('PENDING');
  const [reviewingReqId, setReviewingReqId] = useState<string | null>(null);
  const [reviewDecision, setReviewDecision] = useState<'APPROVED' | 'REJECTED'>('APPROVED');
  const [reviewReason, setReviewReason] = useState('');
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);

  // Filters State
  const [dateFilterType, setDateFilterType] = useState<'TODAY' | 'TOMORROW' | 'CUSTOM' | 'ALL'>('TODAY');
  const [customDate, setCustomDate] = useState('');
  const [selectedClinic, setSelectedClinic] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Refresh Trigger
  const [refreshKey, setRefreshKey] = useState(0);

  // Banner Callout
  const [activeCallout, setActiveCallout] = useState<string | null>(null);

  // Transfer Modal State
  const [transferApt, setTransferApt] = useState<Appointment | null>(null);
  const [targetClinicId, setTargetClinicId] = useState('');
  const [transferReason, setTransferReason] = useState('');
  const [isTransferring, setIsTransferring] = useState(false);

  // Walk-In Modal State
  const [showWalkInModal, setShowWalkInModal] = useState(false);
  const [walkInPatientName, setWalkInPatientName] = useState('');
  const [walkInPhone, setWalkInPhone] = useState('');
  const [walkInClinicId, setWalkInClinicId] = useState('');
  const [walkInServiceId, setWalkInServiceId] = useState('');
  const [walkInAppointmentDate, setWalkInAppointmentDate] = useState('');
  const [walkInAge, setWalkInAge] = useState('');
  const [walkInAddress, setWalkInAddress] = useState('');
  const [walkInSubmitting, setWalkInSubmitting] = useState(false);
  const [walkInError, setWalkInError] = useState<string | null>(null);
  const [walkInServicesList, setWalkInServicesList] = useState<ClinicService[]>([]);
  const [walkInSuccessReceipt, setWalkInSuccessReceipt] = useState<Appointment | null>(null);

  // Clinic Services in Edit Clinic Modal
  const [editingClinicServices, setEditingClinicServices] = useState<ClinicService[]>([]);
  const [loadingClinicServices, setLoadingClinicServices] = useState(false);
  const [newServiceName, setNewServiceName] = useState('');
  const [newServiceCapacity, setNewServiceCapacity] = useState(20);
  const [newServiceDocs, setNewServiceDocs] = useState('');
  const [newServiceInstructions, setNewServiceInstructions] = useState('');
  const [addingServiceLoading, setAddingServiceLoading] = useState(false);
  const [deletingServiceId, setDeletingServiceId] = useState<string | null>(null);

  // Admin Clinics Management State
  const [adminClinics, setAdminClinics] = useState<Clinic[]>([]);
  const [loadingAdminClinics, setLoadingAdminClinics] = useState(false);
  const [editingClinic, setEditingClinic] = useState<Clinic | null>(null);

  // Create Clinic Modal State
  const [showCreateClinicModal, setShowCreateClinicModal] = useState(false);
  const [newClinicName, setNewClinicName] = useState('');
  const [newClinicDesc, setNewClinicDesc] = useState('');
  const [newClinicLocation, setNewClinicLocation] = useState('');
  const [newClinicHours, setNewClinicHours] = useState('08:30-14:00');
  const [newClinicDays, setNewClinicDays] = useState<number[]>([0, 1, 2, 3, 4, 6]);
  const [newClinicCapacity, setNewClinicCapacity] = useState(20);
  const [newClinicInstructions, setNewClinicInstructions] = useState('');
  const [newClinicDocs, setNewClinicDocs] = useState('أصل شهادة ميلاد الطفل أو بطاقة التأمين الصحي\nصورة بطاقة ولي الأمر');
  const [creatingClinic, setCreatingClinic] = useState(false);

  // Calendar Exceptions Modal State
  const [managingSchedulesClinic, setManagingSchedulesClinic] = useState<Clinic | null>(null);
  const [clinicSchedulesList, setClinicSchedulesList] = useState<ClinicScheduleException[]>([]);
  const [loadingSchedules, setLoadingSchedules] = useState(false);
  const [newExceptionDate, setNewExceptionDate] = useState('');
  const [newExceptionIsClosed, setNewExceptionIsClosed] = useState(true);
  const [newExceptionReason, setNewExceptionReason] = useState('عطلة رسمية');
  const [newExceptionCapacity, setNewExceptionCapacity] = useState(20);
  const [savingException, setSavingException] = useState(false);

  // Admin Audit Logs State
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [loadingAuditLogs, setLoadingAuditLogs] = useState(false);

  // Helper date calculators
  const getEffectiveDateString = useCallback((): string => {
    const today = new Date();
    if (dateFilterType === 'TODAY') {
      return formatLocalDate(today);
    } else if (dateFilterType === 'TOMORROW') {
      const tomorrow = new Date(today);
      tomorrow.setDate(today.getDate() + 1);
      return formatLocalDate(tomorrow);
    } else if (dateFilterType === 'CUSTOM') {
      return customDate || formatLocalDate(today);
    }
    return 'ALL';
  }, [dateFilterType, customDate]);

  // Load clinics on mount
  useEffect(() => {
    let active = true;
    async function loadClinics() {
      try {
        const res = await fetch('/api/clinics');
        const data = await res.json();
        if (active && data.clinics) {
          setClinics(data.clinics);
          if (data.clinics.length > 0) {
            setTargetClinicId(data.clinics[0].id);
            setWalkInClinicId(data.clinics[0].id);
          }
        }
      } catch (err) {
        console.error('Error fetching clinics:', err);
      }
    }
    loadClinics();
    return () => {
      active = false;
    };
  }, []);

  // Fetch appointments on filter change
  useEffect(() => {
    let active = true;
    const token = localStorage.getItem('bsch_staff_token');
    if (!token) {
      router.push('/staff/login');
      return;
    }

    async function loadAppointments() {
      try {
        const effectiveDate = getEffectiveDateString();
        const url = new URL('/api/staff/appointments', window.location.origin);
        if (selectedClinic !== 'ALL') url.searchParams.set('clinicId', selectedClinic);
        if (selectedStatus !== 'ALL') url.searchParams.set('status', selectedStatus);
        if (effectiveDate !== 'ALL') url.searchParams.set('date', effectiveDate);
        if (searchQuery) url.searchParams.set('search', searchQuery);

        const res = await fetch(url.toString(), {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res.status === 401) {
          localStorage.removeItem('bsch_staff_token');
          router.push('/staff/login');
          return;
        }

        const data = await res.json();
        if (active && data.success) {
          setAppointments(data.appointments || []);
          setCurrentUser(data.user);
          // Auto filter doctor to their clinic if not set
          if (data.user?.role === 'DOCTOR' && data.user?.clinicId && selectedClinic === 'ALL') {
            setSelectedClinic(data.user.clinicId);
          }
        }
      } catch (err) {
        console.error('Error fetching staff data:', err);
      } finally {
        if (active) setLoading(false);
      }
    }

    loadAppointments();
    return () => {
      active = false;
    };
  }, [router, selectedClinic, selectedStatus, searchQuery, getEffectiveDateString, refreshKey]);

  // Load services for walk-in selected clinic
  useEffect(() => {
    if (!walkInClinicId) return;
    let active = true;
    async function loadWalkInServices() {
      try {
        const res = await fetch(`/api/clinics/${walkInClinicId}/services`);
        const data = await res.json();
        if (active && data.services) {
          setWalkInServicesList(data.services.filter((s: ClinicService) => s.isActive !== false));
          setWalkInServiceId('');
        }
      } catch {
        if (active) setWalkInServicesList([]);
      }
    }
    loadWalkInServices();
    return () => {
      active = false;
    };
  }, [walkInClinicId]);

  // Load services for editing clinic
  useEffect(() => {
    if (!editingClinic?.id) {
      setEditingClinicServices([]);
      return;
    }
    const currentEditingClinicId = editingClinic.id;
    let active = true;
    async function loadServices() {
      setLoadingClinicServices(true);
      try {
        const token = localStorage.getItem('bsch_staff_token');
        const res = await fetch(`/api/staff/cms/clinics/${currentEditingClinicId}/services`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (active && data.services) {
          setEditingClinicServices(data.services);
        }
      } catch (err) {
        console.error(err);
      } finally {
        if (active) setLoadingClinicServices(false);
      }
    }
    loadServices();
    return () => {
      active = false;
    };
  }, [editingClinic?.id]);

  // Fetch Admin Clinics
  const fetchAdminClinics = useCallback(async () => {
    const token = localStorage.getItem('bsch_staff_token');
    if (!token) return;
    setLoadingAdminClinics(true);
    try {
      const res = await fetch('/api/staff/clinics', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success && data.clinics) {
        setAdminClinics(data.clinics);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingAdminClinics(false);
    }
  }, []);

  // Fetch Admin Audit Logs
  const fetchAuditLogs = useCallback(async () => {
    const token = localStorage.getItem('bsch_staff_token');
    if (!token) return;
    setLoadingAuditLogs(true);
    try {
      const res = await fetch('/api/staff/audit-logs', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success && data.logs) {
        setAuditLogs(data.logs);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingAuditLogs(false);
    }
  }, []);

  const loadCancellationRequests = useCallback(async () => {
    const token = localStorage.getItem('bsch_staff_token');
    if (!token) return;
    setLoadingCancellationRequests(true);
    try {
      const url = new URL('/api/staff/cancellation-requests', window.location.origin);
      if (cancellationFilterStatus !== 'ALL') {
        url.searchParams.set('status', cancellationFilterStatus);
      }
      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setCancellationRequests(data.requests || []);
      }
    } catch (err) {
      console.error('Error loading cancellation requests:', err);
    } finally {
      setLoadingCancellationRequests(false);
    }
  }, [cancellationFilterStatus]);

  useEffect(() => {
    let active = true;
    const token = localStorage.getItem('bsch_staff_token');
    if (!token) return;

    if (activeTab === 'CLINICS') {
      fetch('/api/staff/clinics', {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => res.json())
        .then((data) => {
          if (active && data.success && data.clinics) {
            setAdminClinics(data.clinics);
          }
        })
        .catch((e) => console.error(e));
    } else if (activeTab === 'AUDIT') {
      fetch('/api/staff/audit-logs', {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => res.json())
        .then((data) => {
          if (active && data.success && data.logs) {
            setAuditLogs(data.logs);
          }
        })
        .catch((e) => console.error(e));
    } else if (activeTab === 'CANCELLATIONS') {
      loadCancellationRequests();
    }

    return () => {
      active = false;
    };
  }, [activeTab, loadCancellationRequests]);

  useEffect(() => {
    loadCancellationRequests();
  }, [loadCancellationRequests, refreshKey]);

  async function handleReviewCancellation(requestId: string, decision: 'APPROVED' | 'REJECTED', reason?: string) {
    const token = localStorage.getItem('bsch_staff_token');
    if (!token) return;
    setIsSubmittingReview(true);
    try {
      const res = await fetch(`/api/staff/cancellation-requests/${requestId}/review`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ decision, reason }),
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message || (decision === 'APPROVED' ? 'تمت الموافقة على طلب الإلغاء وإلغاء الحجز بنجاح' : 'تم رفض طلب الإلغاء واحتفاظ الحجز بحالته'));
        setReviewingReqId(null);
        setReviewReason('');
        loadCancellationRequests();
        setRefreshKey((k) => k + 1);
      } else {
        alert(data.error || 'تعذر البت في طلب الإلغاء');
      }
    } catch {
      alert('حدث خطأ أثناء معالجة الطلب');
    } finally {
      setIsSubmittingReview(false);
    }
  }

  // Status Change Handler
  async function handleStatusChange(appointmentId: string, newStatus: AppointmentStatus, note?: string) {
    const token = localStorage.getItem('bsch_staff_token');
    if (!token) return;

    try {
      const res = await fetch(`/api/appointments/${appointmentId}/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: newStatus, note }),
      });

      const data = await res.json();
      if (data.success) {
        if (newStatus === 'CHECKED_IN') {
          setActiveCallout(`تم نداء المريض: ${data.appointment.patientName} (${data.appointment.clinicName}) - دور #${data.appointment.queueNumber || 1}`);
          setTimeout(() => setActiveCallout(null), 8000);
        }
        setRefreshKey((k) => k + 1);
      } else {
        alert(data.error || 'تعذر تغيير الحالة');
      }
    } catch (err) {
      console.error('Error updating status:', err);
      alert('حدث خطأ أثناء تعديل حالة الحجز');
    }
  }

  // Recall Patient Handler
  async function handleRecall(appointmentId: string) {
    const token = localStorage.getItem('bsch_staff_token');
    if (!token) return;

    try {
      const res = await fetch(`/api/appointments/${appointmentId}/recall`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await res.json();
      if (data.success) {
        setActiveCallout(`📢 إعادة نداء: دور #${data.appointment.queueNumber} - المريض ${data.appointment.patientName} (${data.appointment.clinicName})`);
        setTimeout(() => setActiveCallout(null), 8000);
        setRefreshKey((k) => k + 1);
      } else {
        alert(data.error || 'تعذر إعادة نداء المريض');
      }
    } catch (err) {
      console.error(err);
      alert('حدث خطأ في إعادة النداء');
    }
  }

  // Transfer Clinic Handler
  async function handleConfirmTransfer() {
    if (!transferApt || !targetClinicId) return;
    const token = localStorage.getItem('bsch_staff_token');
    if (!token) return;

    setIsTransferring(true);
    try {
      const res = await fetch(`/api/appointments/${transferApt.id}/transfer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          targetClinicId,
          reason: transferReason || 'تحويل استشاري بين العيادات',
        }),
      });

      const data = await res.json();
      if (data.success) {
        alert(data.message || 'تم تحويل المريض بنجاح');
        setTransferApt(null);
        setTransferReason('');
        setRefreshKey((k) => k + 1);
      } else {
        alert(data.error || 'تعذر تحويل المريض');
      }
    } catch (err) {
      console.error(err);
      alert('حدث خطأ أثناء التحويل');
    } finally {
      setIsTransferring(false);
    }
  }

  // Walk-In Booking Handler
  async function handleWalkInSubmit(e: React.FormEvent) {
    e.preventDefault();
    setWalkInError(null);
    const token = localStorage.getItem('bsch_staff_token');
    if (!token) return;

    const chosenDate = walkInAppointmentDate || formatLocalDate();

    // Check clinic working days
    const currentClinic = clinics.find((c) => c.id === walkInClinicId);
    if (currentClinic && currentClinic.daysOfWeek && currentClinic.daysOfWeek.length > 0) {
      const dayOfWeek = new Date(chosenDate + 'T00:00:00Z').getUTCDay();
      if (!currentClinic.daysOfWeek.includes(dayOfWeek)) {
        setWalkInError('تنبيه: العيادة المختارة لا تعمل في هذا اليوم وفقاً لجدول العمل الأسبوعي.');
        return;
      }
    }

    setWalkInSubmitting(true);
    try {
      const res = await fetch('/api/appointments/walk-in', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          clinicId: walkInClinicId,
          serviceId: walkInServiceId || undefined,
          patientName: walkInPatientName,
          phoneNumber: walkInPhone,
          patientAge: walkInAge,
          patientAddress: walkInAddress,
          appointmentDate: chosenDate,
        }),
      });

      const data = await res.json();
      if (data.success && data.appointment) {
        setShowWalkInModal(false);
        setWalkInSuccessReceipt(data.appointment);
        setWalkInPatientName('');
        setWalkInPhone('');
        setWalkInAge('');
        setWalkInAddress('');
        setWalkInServiceId('');
        setWalkInAppointmentDate('');
        setRefreshKey((k) => k + 1);
      } else {
        setWalkInError(data.error || 'تعذر تسجيل الحجز الحضوري');
      }
    } catch (err) {
      console.error(err);
      setWalkInError('حدث خطأ أثناء إرسال البيانات');
    } finally {
      setWalkInSubmitting(false);
    }
  }

  // Add Service to Clinic Handler
  async function handleAddServiceToClinic() {
    if (!editingClinic || !newServiceName.trim()) {
      alert('يرجى كتابة اسم الخدمة أولاً');
      return;
    }
    const token = localStorage.getItem('bsch_staff_token');
    if (!token) return;

    setAddingServiceLoading(true);
    try {
      const res = await fetch(`/api/staff/cms/clinics/${editingClinic.id}/services`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: newServiceName.trim(),
          maxDailyCapacity: Number(newServiceCapacity) || 20,
          requiredDocuments: newServiceDocs.split('\n').map((s) => s.trim()).filter(Boolean),
          instructions: newServiceInstructions.trim(),
          isActive: true,
        }),
      });
      const data = await res.json();
      if (data.success && data.service) {
        setEditingClinicServices((prev) => [...prev, data.service]);
        setNewServiceName('');
        setNewServiceCapacity(20);
        setNewServiceDocs('');
        setNewServiceInstructions('');
        alert('تمت إضافة الخدمة للعيادة بنجاح');
      } else {
        alert(data.error || 'تعذر إضافة الخدمة');
      }
    } catch {
      alert('حدث خطأ أثناء الاتصال بالخادم');
    } finally {
      setAddingServiceLoading(false);
    }
  }

  // Delete Service from Clinic Handler
  async function handleDeleteServiceFromClinic(serviceId: string) {
    if (!editingClinic) return;
    if (!confirm('هل تريد بالتأكيد حذف هذه الخدمة من العيادة؟')) return;

    const token = localStorage.getItem('bsch_staff_token');
    if (!token) return;

    setDeletingServiceId(serviceId);
    try {
      const res = await fetch(`/api/staff/cms/clinics/${editingClinic.id}/services?serviceId=${serviceId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await res.json();
      if (data.success) {
        setEditingClinicServices((prev) => prev.filter((s) => s.id !== serviceId));
        alert('تم حذف / إلغاء تفعيل الخدمة بنجاح');
      } else {
        alert(data.error || 'تعذر حذف الخدمة');
      }
    } catch {
      alert('حدث خطأ أثناء الاتصال بالخادم');
    } finally {
      setDeletingServiceId(null);
    }
  }

  // Admin Clinic Update Handler
  async function handleSaveClinic(clinic: Clinic) {
    const token = localStorage.getItem('bsch_staff_token');
    if (!token) return;

    try {
      const res = await fetch(`/api/staff/clinics/${clinic.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(clinic),
      });

      const data = await res.json();
      if (data.success) {
        alert(data.message || 'تم تحديث العيادة بنجاح');
        setEditingClinic(null);
        fetchAdminClinics();
      } else {
        alert(data.error || 'تعذر تحديث العيادة');
      }
    } catch (e) {
      console.error(e);
      alert('حدث خطأ أثناء الحفظ');
    }
  }

  // Admin Create Clinic
  async function handleCreateClinic(e: React.FormEvent) {
    e.preventDefault();
    const token = localStorage.getItem('bsch_staff_token');
    if (!token) return;
    if (!newClinicName.trim()) {
      alert('يرجى إدخال اسم العيادة');
      return;
    }
    if (!newClinicLocation.trim()) {
      alert('يرجى إدخال موقع العيادة الداخلي');
      return;
    }
    setCreatingClinic(true);
    try {
      const res = await fetch('/api/staff/clinics', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: newClinicName.trim(),
          description: newClinicDesc.trim() || undefined,
          location: newClinicLocation.trim(),
          workingHours: newClinicHours.trim(),
          daysOfWeek: newClinicDays,
          maxDailySlots: Number(newClinicCapacity) || 20,
          instructions: newClinicInstructions.trim() || undefined,
          requiredDocuments: newClinicDocs
            .split('\n')
            .map((s) => s.trim())
            .filter(Boolean),
        }),
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message || 'تم إنشاء العيادة بنجاح');
        setShowCreateClinicModal(false);
        setNewClinicName('');
        setNewClinicDesc('');
        setNewClinicLocation('');
        setNewClinicInstructions('');
        fetchAdminClinics();
      } else {
        alert(data.error || 'تعذر إنشاء العيادة');
      }
    } catch {
      alert('حدث خطأ أثناء إنشاء العيادة');
    } finally {
      setCreatingClinic(false);
    }
  }

  // Admin Delete / Deactivate Clinic
  async function handleDeleteClinic(clinicId: string, clinicName: string) {
    const token = localStorage.getItem('bsch_staff_token');
    if (!token) return;
    const confirmed = window.confirm(
      `هل أنت متأكد من حذف أو إيقاف عيادة "${clinicName}"؟\nملاحظة: إذا كان للعيادة حجوزات سابقة، فسيتم إيقاف تفعيلها مؤقتاً لحماية تاريخ المرضى.`
    );
    if (!confirmed) return;

    try {
      const res = await fetch(`/api/staff/clinics/${clinicId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message || 'تمت معالجة العملية بنجاح');
        fetchAdminClinics();
      } else {
        alert(data.error || 'تعذر حذف العيادة');
      }
    } catch {
      alert('حدث خطأ في الاتصال بالخادم');
    }
  }

  // Schedules Modal Handlers
  async function openSchedulesModal(clinic: Clinic) {
    setManagingSchedulesClinic(clinic);
    setNewExceptionCapacity(clinic.maxDailySlots);
    const token = localStorage.getItem('bsch_staff_token');
    if (!token) return;
    setLoadingSchedules(true);
    try {
      const res = await fetch(`/api/staff/clinics/${clinic.id}/schedules`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success && data.schedules) {
        setClinicSchedulesList(data.schedules);
      }
    } catch {
      console.error('Error fetching schedules');
    } finally {
      setLoadingSchedules(false);
    }
  }

  async function handleSaveScheduleException(e: React.FormEvent) {
    e.preventDefault();
    if (!managingSchedulesClinic || !newExceptionDate) {
      alert('يرجى اختيار التاريخ');
      return;
    }
    const token = localStorage.getItem('bsch_staff_token');
    if (!token) return;
    setSavingException(true);
    try {
      const res = await fetch(`/api/staff/clinics/${managingSchedulesClinic.id}/schedules`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          scheduleDate: newExceptionDate,
          isClosed: newExceptionIsClosed,
          closureReason: newExceptionIsClosed ? newExceptionReason : undefined,
          maxCapacity: !newExceptionIsClosed ? Number(newExceptionCapacity) : undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        alert('تم حفظ استثناء التقويم بنجاح');
        setNewExceptionDate('');
        openSchedulesModal(managingSchedulesClinic);
      } else {
        alert(data.error || 'تعذر حفظ الاستثناء');
      }
    } catch {
      alert('حدث خطأ أثناء حفظ الاستثناء');
    } finally {
      setSavingException(false);
    }
  }

  async function handleDeleteScheduleException(scheduleDate: string) {
    if (!managingSchedulesClinic) return;
    const token = localStorage.getItem('bsch_staff_token');
    if (!token) return;
    const confirmed = window.confirm(`هل أنت متأكد من حذف استثناء تاريخ ${scheduleDate}؟`);
    if (!confirmed) return;
    try {
      const res = await fetch(`/api/staff/clinics/${managingSchedulesClinic.id}/schedules`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ scheduleDate }),
      });
      const data = await res.json();
      if (data.success) {
        openSchedulesModal(managingSchedulesClinic);
      } else {
        alert(data.error || 'تعذر حذف الاستثناء');
      }
    } catch {
      alert('حدث خطأ أثناء الحذف');
    }
  }

  function handleLogout() {
    const token = localStorage.getItem('bsch_staff_token');
    if (token) {
      fetch('/api/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(console.error);
    }
    localStorage.removeItem('bsch_staff_token');
    localStorage.removeItem('bsch_staff_user');
    router.push('/staff/login');
  }

  // Metrics
  const totalCount = appointments.length;
  const pendingCount = appointments.filter((a) => a.status === 'PENDING_REVIEW').length;
  const confirmedCount = appointments.filter((a) => a.status === 'CONFIRMED').length;
  const checkedInCount = appointments.filter((a) => a.status === 'CHECKED_IN').length;
  const completedCount = appointments.filter((a) => a.status === 'COMPLETED').length;

  const isAdmin = currentUser?.role === 'ADMIN';
  const isDoctor = currentUser?.role === 'DOCTOR';
  const isReceptionist = currentUser?.role === 'RECEPTIONIST';

  return (
    <div className="min-h-screen bg-[#F6F9FB] flex flex-col text-right">
      <style jsx global>{`
        @media print {
          body {
            background: #ffffff !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          body * {
            visibility: hidden;
          }
          #printable-walkin-receipt, #printable-walkin-receipt * {
            visibility: visible;
          }
          #printable-walkin-receipt {
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 24px !important;
            border: 2px solid #087F78 !important;
            border-radius: 12px !important;
            background: #ffffff !important;
          }
          header, nav, button, .no-print {
            display: none !important;
          }
        }
      `}</style>
      
      {/* Top Staff Header */}
      <header className="bg-white border-b border-[#E2E8EE] sticky top-0 z-30 shadow-2xs no-print">
        <div className="max-w-[1250px] mx-auto px-3 sm:px-6 h-16 sm:h-18 flex items-center justify-between gap-2">
          
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <Link href="/" className="transition-transform hover:scale-105 shrink-0" title="العودة للرئيسية">
              <Image
                src="/logo-main.png"
                alt="شعار مستشفى الأطفال التخصصي بالبحيرة"
                width={44}
                height={44}
                className="w-8 sm:w-11 h-auto object-contain drop-shadow-xs"
                priority
              />
            </Link>
            <div className="min-w-0">
              <span className="text-xs sm:text-base font-bold text-[#124E4A] block truncate">
                لوحة تحكم العيادات الخارجية
              </span>
              <span className="text-3xs sm:text-2xs text-[#8493A6] block truncate">
                مستشفى الأطفال التخصصي بالبحيرة
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
            {/* Quick Walk-in Booking Button */}
            {(isReceptionist || isAdmin) && (
              <button
                onClick={() => setShowWalkInModal(true)}
                className="inline-flex items-center gap-1 px-2.5 sm:px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-2xs sm:text-xs font-bold shadow-xs transition-colors shrink-0"
                title="تسجيل مريض حضر للمستشفى مباشرة"
              >
                <UserPlus className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span>حجز حضوري</span>
              </button>
            )}

            {currentUser && (
              <div className="hidden lg:flex flex-col text-left text-xs bg-slate-50 px-3 py-1 rounded-xl border border-slate-200">
                <span className="font-bold text-[#163C3A]">{currentUser.name}</span>
                <span className="text-[#087F78] text-3xs font-semibold">
                  {currentUser.role === 'ADMIN'
                    ? '🛡️ مدير النظام'
                    : currentUser.role === 'DOCTOR'
                    ? '🩺 طبيب العيادة'
                    : '📋 الاستقبال والحجز'}
                </span>
              </div>
            )}

            <button
              onClick={handleLogout}
              className="inline-flex items-center gap-1 px-2.5 sm:px-3 py-1.5 rounded-xl text-2xs sm:text-xs font-semibold text-red-600 hover:bg-red-50 border border-red-200 transition-colors shrink-0"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>خروج</span>
            </button>
          </div>

        </div>
      </header>

      {/* Main Workspace */}
      <main className="flex-1 max-w-[1250px] w-full mx-auto px-3 sm:px-6 py-4 sm:py-6 space-y-4 sm:space-y-6">
        
        {/* Callout Broadcast Alert */}
        {activeCallout && (
          <div className="p-3.5 sm:p-4 rounded-2xl bg-blue-600 text-white flex items-center justify-between gap-2 shadow-lg animate-in slide-in-from-top duration-300">
            <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                <Megaphone className="w-4 h-4 sm:w-5 sm:h-5 text-white animate-bounce" />
              </div>
              <div className="min-w-0">
                <span className="text-3xs sm:text-xs uppercase tracking-wider font-bold text-blue-200 block">
                  تنبيه نداء المريض بالعيادة
                </span>
                <span className="text-xs sm:text-base font-extrabold truncate block">{activeCallout}</span>
              </div>
            </div>
            <button
              onClick={() => setActiveCallout(null)}
              className="text-xs bg-white/20 hover:bg-white/30 px-2.5 py-1 rounded-lg shrink-0"
            >
              إغلاق
            </button>
          </div>
        )}

        {/* Role Tabs */}
        <div className="flex items-center justify-between border-b border-[#E2E8EE] pb-2 sm:pb-3 overflow-hidden">
          <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto max-w-full pb-1 scrollbar-none touch-pan-x whitespace-nowrap">
            <button
              onClick={() => setActiveTab('QUEUE')}
              className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all shrink-0 ${
                activeTab === 'QUEUE'
                  ? 'bg-[#087F78] text-white shadow-xs'
                  : 'text-[#163C3A] hover:bg-slate-100 bg-white border border-[#E2E8EE]'
              }`}
            >
              <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span>طابور العيادة والحجوزات</span>
            </button>

            {(isReceptionist || isAdmin) && (
              <button
                onClick={() => setActiveTab('CANCELLATIONS')}
                className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all shrink-0 ${
                  activeTab === 'CANCELLATIONS'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'text-[#163C3A] hover:bg-slate-100 bg-white border border-[#E2E8EE]'
                }`}
              >
                <AlertCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span>طلبات الإلغاء</span>
                {cancellationRequests.filter((r) => r.status === 'PENDING').length > 0 && (
                  <span className="bg-red-500 text-white text-3xs font-extrabold px-1.5 py-0.5 rounded-full animate-pulse">
                    {cancellationRequests.filter((r) => r.status === 'PENDING').length}
                  </span>
                )}
              </button>
            )}

            {isAdmin && (
              <>
                <button
                  onClick={() => setActiveTab('CLINICS')}
                  className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all shrink-0 ${
                    activeTab === 'CLINICS'
                      ? 'bg-[#087F78] text-white shadow-xs'
                      : 'text-[#163C3A] hover:bg-slate-100 bg-white border border-[#E2E8EE]'
                  }`}
                >
                  <Settings className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  <span>إدارة العيادات والسعة</span>
                </button>

                <button
                  onClick={() => setActiveTab('AUDIT')}
                  className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all shrink-0 ${
                    activeTab === 'AUDIT'
                      ? 'bg-[#087F78] text-white shadow-xs'
                      : 'text-[#163C3A] hover:bg-slate-100 bg-white border border-[#E2E8EE]'
                  }`}
                >
                  <History className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  <span>سجل العمليات</span>
                </button>

                <button
                  onClick={() => setActiveTab('CMS')}
                  className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all shrink-0 ${
                    activeTab === 'CMS'
                      ? 'bg-[#087F78] text-white shadow-xs'
                      : 'text-[#163C3A] hover:bg-slate-100 bg-white border border-[#E2E8EE]'
                  }`}
                >
                  <Globe className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  <span>إدارة الموقع (CMS)</span>
                </button>
              </>
            )}
          </div>

          <div className="text-xs text-[#8493A6] hidden xl:block shrink-0 pr-2">
            {isDoctor ? '🩺 وضع شاشة الطبيب المباشر' : isAdmin ? '🛡️ وضع مدير المستشفى الكامل' : '📋 وضع موظف الاستقبال والتنظيم'}
          </div>
        </div>

        {/* TAB 1: QUEUE & APPOINTMENTS */}
        {activeTab === 'QUEUE' && (
          <>
            {/* Metric Cards Row */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 sm:gap-3.5">
              <div className="bg-white rounded-xl sm:rounded-2xl border border-[#E2E8EE] p-3 sm:p-4 text-right shadow-2xs">
                <span className="text-3xs sm:text-2xs font-semibold text-[#8493A6] block">إجمالي الحجوزات</span>
                <span className="text-xl sm:text-2xl font-black text-[#124E4A] font-mono mt-0.5 sm:mt-1 block">{totalCount}</span>
              </div>

              <div className="bg-white rounded-xl sm:rounded-2xl border border-[#FDE68A] bg-amber-50/40 p-3 sm:p-4 text-right shadow-2xs">
                <span className="text-3xs sm:text-2xs font-semibold text-[#D97706] block">بانتظار التأكيد</span>
                <span className="text-xl sm:text-2xl font-black text-[#D97706] font-mono mt-0.5 sm:mt-1 block">{pendingCount}</span>
              </div>

              <div className="bg-white rounded-xl sm:rounded-2xl border border-[#B2DFDB] bg-[#E6F4F2]/40 p-3 sm:p-4 text-right shadow-2xs">
                <span className="text-3xs sm:text-2xs font-semibold text-[#087F78] block">المؤكدة (في الانتظار)</span>
                <span className="text-xl sm:text-2xl font-black text-[#087F78] font-mono mt-0.5 sm:mt-1 block">{confirmedCount}</span>
              </div>

              <div className="bg-white rounded-xl sm:rounded-2xl border border-blue-200 bg-blue-50/40 p-3 sm:p-4 text-right shadow-2xs">
                <span className="text-3xs sm:text-2xs font-semibold text-blue-600 block">في الدور / تم النداء</span>
                <span className="text-xl sm:text-2xl font-black text-blue-700 font-mono mt-0.5 sm:mt-1 block">{checkedInCount}</span>
              </div>

              <div className="bg-white rounded-xl sm:rounded-2xl border border-emerald-200 bg-emerald-50/40 p-3 sm:p-4 text-right shadow-2xs col-span-2 sm:col-span-1">
                <span className="text-3xs sm:text-2xs font-semibold text-emerald-700 block">تم الكشف (مكتمل)</span>
                <span className="text-xl sm:text-2xl font-black text-emerald-700 font-mono mt-0.5 sm:mt-1 block">{completedCount}</span>
              </div>
            </div>

            {/* Filter and Search Bar */}
            <div className="bg-white rounded-2xl border border-[#E2E8EE] p-3 sm:p-4 shadow-2xs space-y-3">
              
              {/* Date Filter Row */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Calendar className="w-4 h-4 text-[#087F78]" />
                    <span className="text-xs font-bold text-[#124E4A]">فلترة التاريخ:</span>
                  </div>
                  
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      onClick={() => setDateFilterType('TODAY')}
                      className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        dateFilterType === 'TODAY'
                          ? 'bg-[#087F78] text-white shadow-2xs'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      اليوم
                    </button>
                    <button
                      onClick={() => setDateFilterType('TOMORROW')}
                      className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        dateFilterType === 'TOMORROW'
                          ? 'bg-[#087F78] text-white shadow-2xs'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      غداً
                    </button>
                    <button
                      onClick={() => setDateFilterType('ALL')}
                      className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        dateFilterType === 'ALL'
                          ? 'bg-[#087F78] text-white shadow-2xs'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      كل التواريخ
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-2">
                  <span className="text-2xs text-[#8493A6] shrink-0">أو حدد تاريخاً:</span>
                  <input
                    type="date"
                    value={customDate}
                    onChange={(e) => {
                      setCustomDate(e.target.value);
                      setDateFilterType('CUSTOM');
                    }}
                    className="flex-1 sm:flex-initial px-2.5 py-1 text-xs rounded-lg border border-[#E2E8EE] text-[#163C3A] font-mono"
                  />
                </div>
              </div>

              {/* Search, Clinic, and Status Controls */}
              <div className="space-y-2.5">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {/* Search Input */}
                  <div className="relative sm:col-span-1">
                    <Search className="w-4 h-4 text-[#8493A6] absolute right-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="ابحث باسم المريض أو الهاتف أو الكود..."
                      className="w-full pr-9 pl-3 py-2 rounded-xl border border-[#E2E8EE] text-xs text-[#163C3A] text-right focus:border-[#087F78] bg-[#F6F9FB]"
                    />
                  </div>

                  {/* Clinic Filter */}
                  <select
                    value={selectedClinic}
                    onChange={(e) => setSelectedClinic(e.target.value)}
                    disabled={isDoctor && !!currentUser?.clinicId}
                    className="w-full px-3 py-2 rounded-xl border border-[#E2E8EE] text-xs font-semibold text-[#163C3A] bg-white focus:border-[#087F78]"
                  >
                    {!isDoctor && <option value="ALL">جميع العيادات</option>}
                    {clinics.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>

                  {/* Status Filter */}
                  <select
                    value={selectedStatus}
                    onChange={(e) => setSelectedStatus(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-[#E2E8EE] text-xs font-semibold text-[#163C3A] bg-white focus:border-[#087F78]"
                  >
                    <option value="ALL">جميع الحالات</option>
                    <option value="PENDING_REVIEW">قيد المراجعة</option>
                    <option value="CONFIRMED">مؤكد (في الانتظار)</option>
                    <option value="CHECKED_IN">حضر المريض (في الدور)</option>
                    <option value="COMPLETED">مكتمل (تم الكشف)</option>
                    <option value="CANCELLED">ملغي</option>
                  </select>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-2 pt-1 border-t border-slate-50 flex-wrap">
                  {(isReceptionist || isAdmin) && (
                    <button
                      onClick={() => setShowWalkInModal(true)}
                      className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold shadow-xs transition-colors"
                      title="تسجيل مريض حضر للمستشفى مباشرة"
                    >
                      <UserPlus className="w-4 h-4" />
                      <span>تسجيل حجز حضوري</span>
                    </button>
                  )}
                  <button
                    onClick={() => setRefreshKey((k) => k + 1)}
                    className="p-2 rounded-xl border border-[#E2E8EE] hover:bg-slate-50 text-[#8493A6] hover:text-[#087F78] transition-colors"
                    title="تحديث البيانات"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => window.print()}
                    className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-[#E2E8EE] text-xs font-semibold text-[#163C3A] hover:bg-slate-50 transition-colors"
                  >
                    <Printer className="w-3.5 h-3.5 text-[#087F78]" />
                    <span>طباعة الكشف</span>
                  </button>
                </div>
              </div>

            </div>

            {/* Appointments Table / Roster */}
            <div className="bg-white rounded-2xl border border-[#E2E8EE] shadow-2xs overflow-hidden">
              {loading ? (
                <div className="p-12 text-center text-xs text-[#8493A6]">جاري تحميل جدول الحجوزات...</div>
              ) : appointments.length === 0 ? (
                <div className="p-12 text-center text-xs text-[#8493A6] space-y-3">
                  <AlertCircle className="w-8 h-8 text-slate-300 mx-auto" />
                  <p className="font-semibold text-slate-700 text-sm">
                    لا توجد حجوزات مسجلة لتاريخ {dateFilterType === 'TODAY' ? 'اليوم' : dateFilterType === 'TOMORROW' ? 'غداً' : 'المحدد'}
                  </p>
                  <p className="text-xs text-slate-500">
                    إذا قمت بتسجيل حجز لتاريخ قادم، يرجى النقر على زر "غداً" أو "عرض كل المواعيد" أدناه:
                  </p>
                  <div className="flex items-center justify-center gap-2 pt-2">
                    {dateFilterType !== 'TOMORROW' && (
                      <button
                        onClick={() => setDateFilterType('TOMORROW')}
                        className="px-3.5 py-1.5 rounded-lg bg-teal-50 hover:bg-teal-100 text-[#087F78] text-xs font-bold border border-teal-200 transition-colors cursor-pointer"
                      >
                        عرض حجوزات الغد (المواعيد القادمة)
                      </button>
                    )}
                    {dateFilterType !== 'ALL' && (
                      <button
                        onClick={() => setDateFilterType('ALL')}
                        className="px-3.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors cursor-pointer"
                      >
                        عرض كل المواعيد
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <>
                  {/* Dedicated Mobile Card View (Optimized for Phones < 768px) */}
                  <div className="block md:hidden divide-y divide-slate-100">
                    {appointments.map((apt) => {
                      const status = getStatusDisplay(apt.status);
                      const hasPendingCancel =
                        apt.hasPendingCancellation ||
                        cancellationRequests.some(
                          (r) =>
                            (r.appointmentId === apt.id ||
                              r.referenceNumber === apt.referenceNumber) &&
                            r.status === 'PENDING'
                        );

                      return (
                        <div key={apt.id} className="p-3.5 space-y-3 bg-white hover:bg-slate-50/50 transition-colors">
                          
                          {/* Card Top: Reference, Queue, Status Badge */}
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-mono font-black text-sm text-[#124E4A] tracking-wide">
                                {apt.referenceNumber}
                              </span>
                              {apt.queueNumber && (
                                <span className="px-2 py-0.5 rounded-md bg-[#E6F4F2] text-[#087F78] text-3xs font-extrabold">
                                  دور #{apt.queueNumber}
                                </span>
                              )}
                            </div>
                            <span
                              className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-3xs font-bold border shrink-0"
                              style={{
                                backgroundColor: status.bg,
                                color: status.color,
                                borderColor: status.border,
                              }}
                            >
                              <span>{status.label}</span>
                            </span>
                          </div>

                          {/* Patient Name & Details */}
                          <div>
                            <div className="text-sm font-bold text-[#163C3A] leading-tight">{apt.patientName}</div>
                            {(apt.patientAge || apt.patientAddress) && (
                              <div className="text-2xs text-[#8493A6] mt-0.5">
                                {apt.patientAge && <span>{apt.patientAge}</span>}
                                {apt.patientAge && apt.patientAddress && <span> — </span>}
                                {apt.patientAddress && <span>{apt.patientAddress}</span>}
                              </div>
                            )}
                          </div>

                          {/* Clinic, Date & Time Block */}
                          <div className="grid grid-cols-2 gap-2 text-2xs p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                            <div>
                              <span className="text-[#8493A6] block text-3xs">العيادة</span>
                              <span className="font-bold text-[#087F78] block truncate">{apt.clinicName}</span>
                            </div>
                            <div>
                              <span className="text-[#8493A6] block text-3xs">الموعد</span>
                              <span className="font-semibold text-[#163C3A] block truncate">
                                {formatArabicDate(apt.appointmentDate)} (الساعة {apt.appointmentTime})
                              </span>
                            </div>
                          </div>

                          {/* Direct Phone Call Link */}
                          <div className="flex items-center justify-between gap-2 pt-0.5">
                            <span className="text-3xs text-[#8493A6]">هاتف التواصل:</span>
                            <a
                              href={`tel:${apt.phoneNumber}`}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-50 hover:bg-teal-100 text-[#087F78] text-xs font-mono font-bold border border-teal-200 transition-colors"
                              title="اتصال هاتفي مباشر"
                            >
                              <Phone className="w-3.5 h-3.5 text-[#087F78]" />
                              <span dir="ltr">{apt.phoneNumber}</span>
                            </a>
                          </div>

                          {/* Pending Cancellation Alert if any */}
                          {hasPendingCancel && (
                            <button
                              type="button"
                              onClick={() => setActiveTab('CANCELLATIONS')}
                              className="w-full flex items-center justify-center gap-1.5 p-2 rounded-xl bg-amber-50 text-amber-900 border border-amber-300 text-2xs font-bold hover:bg-amber-100 transition-colors cursor-pointer"
                            >
                              <AlertCircle className="w-3.5 h-3.5 text-amber-600 animate-pulse shrink-0" />
                              <span>يوجد طلب إلغاء معلق لهذا الحجز (انقر للمراجعة)</span>
                            </button>
                          )}

                          {/* Action Buttons for Mobile View */}
                          <div className="pt-2 border-t border-slate-100 space-y-2">
                            {apt.status === 'PENDING_REVIEW' && (
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => handleStatusChange(apt.id, 'CONFIRMED', 'تمت مراجعة الطلب وتأكيده')}
                                  className="flex-1 py-2.5 px-3 rounded-xl bg-[#087F78] hover:bg-[#124E4A] text-white text-xs font-bold shadow-xs flex items-center justify-center gap-1.5"
                                >
                                  <CheckCircle2 className="w-4 h-4" />
                                  <span>تأكيد الحجز</span>
                                </button>
                                <button
                                  onClick={() => {
                                    const reason = window.prompt('يرجى إدخال سبب إلغاء الحجز (اختياري):', 'اعتذار من ولي الأمر');
                                    if (reason !== null) {
                                      handleStatusChange(apt.id, 'CANCELLED', reason || 'إلغاء الحجز لعدم استيفاء الشروط');
                                    }
                                  }}
                                  className="py-2.5 px-3.5 rounded-xl text-xs font-semibold text-red-600 hover:bg-red-50 border border-red-200 flex items-center justify-center gap-1 shrink-0"
                                >
                                  <XCircle className="w-4 h-4 text-red-500" />
                                  <span>إلغاء</span>
                                </button>
                              </div>
                            )}

                            {apt.status === 'CONFIRMED' && (
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => handleStatusChange(apt.id, 'CHECKED_IN', 'حضر المريض وتم تسجيل الدور ونداؤه')}
                                  className="flex-1 py-2.5 px-3 rounded-xl bg-[#2563EB] hover:bg-blue-700 text-white text-xs font-bold shadow-xs flex items-center justify-center gap-1.5"
                                >
                                  <UserCheck className="w-4 h-4" />
                                  <span>حضور ونداء المريض</span>
                                </button>
                                {(isReceptionist || isAdmin) && (
                                  <button
                                    onClick={() => {
                                      const reason = window.prompt('يرجى إدخال سبب إلغاء الحجز (اختياري):', 'اعتذار من ولي الأمر');
                                      if (reason !== null) {
                                        handleStatusChange(apt.id, 'CANCELLED', reason || 'إلغاء الحجز بواسطة موظف الاستقبال');
                                      }
                                    }}
                                    className="py-2.5 px-3.5 rounded-xl text-xs font-semibold text-red-600 hover:bg-red-50 border border-red-200 flex items-center justify-center gap-1 shrink-0"
                                  >
                                    <XCircle className="w-4 h-4 text-red-500" />
                                    <span>إلغاء</span>
                                  </button>
                                )}
                              </div>
                            )}

                            {apt.status === 'CHECKED_IN' && (
                              <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={() => handleRecall(apt.id)}
                                    className="flex-1 py-2.5 px-3 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold shadow-xs flex items-center justify-center gap-1.5"
                                  >
                                    <Volume2 className="w-4 h-4 animate-pulse" />
                                    <span>إعادة النداء 🔊</span>
                                  </button>

                                  {(isDoctor || isAdmin) && (
                                    <button
                                      onClick={() => handleStatusChange(apt.id, 'COMPLETED', 'تم الكشف وصرف العلاج بنجاح')}
                                      className="flex-1 py-2.5 px-3 rounded-xl bg-[#15803D] hover:bg-emerald-800 text-white text-xs font-bold shadow-xs flex items-center justify-center gap-1.5"
                                    >
                                      <CheckCircle2 className="w-4 h-4" />
                                      <span>إتمام الكشف</span>
                                    </button>
                                  )}

                                  {(isReceptionist || isAdmin) && (
                                    <button
                                      onClick={() => {
                                        const reason = window.prompt('يرجى إدخال سبب إلغاء الحجز (اختياري):', 'انصراف المريض قبل استكمال الكشف');
                                        if (reason !== null) {
                                          handleStatusChange(apt.id, 'CANCELLED', reason || 'إلغاء بواسطة موظف الاستقبال');
                                        }
                                      }}
                                      className="py-2.5 px-3.5 rounded-xl text-xs font-semibold text-red-600 hover:bg-red-50 border border-red-200 flex items-center justify-center gap-1 shrink-0"
                                    >
                                      <XCircle className="w-4 h-4 text-red-500" />
                                      <span>إلغاء</span>
                                    </button>
                                  )}
                                </div>
                              </div>
                            )}

                            {/* Transfer Clinic Button */}
                            {apt.status !== 'CANCELLED' && apt.status !== 'COMPLETED' && (
                              <button
                                onClick={() => {
                                  setTransferApt(apt);
                                  const nextClinic = clinics.find((c) => c.id !== apt.clinicId);
                                  if (nextClinic) setTargetClinicId(nextClinic.id);
                                }}
                                className="w-full py-2 px-3 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
                              >
                                <ArrowRightLeft className="w-3.5 h-3.5" />
                                <span>تحويل المريض لعيادة أخرى</span>
                              </button>
                            )}

                            {apt.status === 'COMPLETED' && (
                              <div className="text-xs text-emerald-600 font-semibold flex items-center justify-center gap-1 py-1">
                                <CheckCircle2 className="w-4 h-4" />
                                <span>تم الكشف واكتمال الإجراءات</span>
                              </div>
                            )}

                            {apt.status === 'CANCELLED' && (
                              <div className="text-xs text-red-500 font-medium text-center py-1">
                                الحجز ملغي
                              </div>
                            )}
                          </div>

                        </div>
                      );
                    })}
                  </div>

                  {/* Desktop Full Table View (>= 768px md) */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-right text-xs">
                      <thead className="bg-[#F6F9FB] border-b border-[#E2E8EE] text-[#8493A6] font-semibold">
                        <tr>
                          <th className="py-3 px-4">الدور / الكود</th>
                          <th className="py-3 px-4">اسم المريض</th>
                          <th className="py-3 px-4">رقم الهاتف</th>
                          <th className="py-3 px-4">العيادة</th>
                          <th className="py-3 px-4">التاريخ والموعد</th>
                          <th className="py-3 px-4">الحالة</th>
                          <th className="py-3 px-4 text-center">الإجراءات المتاحة</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E2E8EE]">
                        {appointments.map((apt) => {
                          const status = getStatusDisplay(apt.status);
                          return (
                            <tr key={apt.id} className="hover:bg-slate-50/70 transition-colors">
                              
                              {/* Queue & Code */}
                              <td className="py-3 px-4 font-mono">
                                <span className="font-bold text-[#124E4A] block">{apt.referenceNumber}</span>
                                {apt.queueNumber && (
                                  <span className="inline-block mt-0.5 px-2 py-0.5 rounded-md bg-[#E6F4F2] text-[#087F78] text-2xs font-bold">
                                    دور #{apt.queueNumber}
                                  </span>
                                )}
                              </td>

                              {/* Patient Name */}
                              <td className="py-3 px-4">
                                <span className="font-bold text-[#163C3A] text-sm block">{apt.patientName}</span>
                                {apt.patientAge && (
                                  <span className="text-2xs text-[#8493A6] block">{apt.patientAge} {apt.patientAddress ? `— ${apt.patientAddress}` : ''}</span>
                                )}
                              </td>

                              {/* Phone */}
                              <td className="py-3 px-4 font-mono text-[#163C3A]" dir="ltr">
                                {apt.phoneNumber}
                              </td>

                              {/* Clinic */}
                              <td className="py-3 px-4 font-semibold text-[#087F78]">
                                {apt.clinicName}
                              </td>

                              {/* Date & Time */}
                              <td className="py-3 px-4">
                                <span className="block text-[#163C3A]">{formatArabicDate(apt.appointmentDate)}</span>
                                <span className="font-mono text-2xs text-[#8493A6]">الساعة {apt.appointmentTime}</span>
                              </td>

                              {/* Status Badge */}
                              <td className="py-3 px-4">
                                <span
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-2xs font-bold border"
                                  style={{
                                    backgroundColor: status.bg,
                                    color: status.color,
                                    borderColor: status.border,
                                  }}
                                >
                                  <span>{status.label}</span>
                                </span>

                                {(apt.hasPendingCancellation ||
                                  cancellationRequests.some(
                                    (r) =>
                                      (r.appointmentId === apt.id ||
                                        r.referenceNumber === apt.referenceNumber) &&
                                      r.status === 'PENDING'
                                  )) && (
                                  <button
                                    type="button"
                                    onClick={() => setActiveTab('CANCELLATIONS')}
                                    className="inline-flex items-center gap-1 mt-1.5 px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 border border-amber-300 text-3xs font-extrabold hover:bg-amber-200 transition-colors cursor-pointer"
                                    title="انقر للانتقال ومراجعة طلب الإلغاء"
                                  >
                                    <AlertCircle className="w-3 h-3 text-amber-600 animate-pulse" />
                                    <span>طلب إلغاء معلق</span>
                                  </button>
                                )}
                              </td>

                              {/* Workflow Actions */}
                              <td className="py-3 px-4">
                                <div className="flex items-center justify-center gap-1.5 flex-wrap">
                                  
                                  {/* Action: Confirm Booking */}
                                  {apt.status === 'PENDING_REVIEW' && (
                                    <>
                                      <button
                                        onClick={() => handleStatusChange(apt.id, 'CONFIRMED', 'تمت مراجعة الطلب وتأكيده')}
                                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#087F78] hover:bg-[#124E4A] text-white text-2xs font-bold shadow-2xs"
                                      >
                                        <CheckCircle2 className="w-3 h-3" />
                                        <span>تأكيد الحجز</span>
                                      </button>
                                      <button
                                        onClick={() => {
                                          const reason = window.prompt('يرجى إدخال سبب إلغاء الحجز (اختياري):', 'اعتذار من ولي الأمر');
                                          if (reason !== null) {
                                            handleStatusChange(apt.id, 'CANCELLED', reason || 'إلغاء الحجز لعدم استيفاء الشروط');
                                          }
                                        }}
                                        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-2xs text-red-600 hover:bg-red-50 border border-red-200"
                                        title="إلغاء طلب الحجز"
                                      >
                                        <XCircle className="w-3 h-3 text-red-500" />
                                        <span>إلغاء</span>
                                      </button>
                                    </>
                                  )}

                                  {/* Action: Call Patient */}
                                  {apt.status === 'CONFIRMED' && (
                                    <>
                                      <button
                                        onClick={() => handleStatusChange(apt.id, 'CHECKED_IN', 'حضر المريض وتم تسجيل الدور ونداؤه')}
                                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#2563EB] hover:bg-blue-700 text-white text-2xs font-bold shadow-2xs"
                                      >
                                        <UserCheck className="w-3 h-3" />
                                        <span>حضور ونداء المريض</span>
                                      </button>
                                      {(isReceptionist || isAdmin) && (
                                        <button
                                          onClick={() => {
                                            const reason = window.prompt('يرجى إدخال سبب إلغاء الحجز (اختياري):', 'اعتذار من ولي الأمر');
                                            if (reason !== null) {
                                              handleStatusChange(apt.id, 'CANCELLED', reason || 'إلغاء الحجز بواسطة موظف الاستقبال');
                                            }
                                          }}
                                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-2xs text-red-600 hover:bg-red-50 border border-red-200"
                                          title="إلغاء هذا الحجز المؤكد"
                                        >
                                          <XCircle className="w-3 h-3 text-red-500" />
                                          <span>إلغاء الحجز</span>
                                        </button>
                                      )}
                                    </>
                                  )}

                                  {/* Action: Recall Patient */}
                                  {apt.status === 'CHECKED_IN' && (
                                    <>
                                      <button
                                        onClick={() => handleRecall(apt.id)}
                                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-2xs font-bold shadow-2xs"
                                        title="إعادة بث نداء صوتي وبصري على شاشة الانتظار"
                                      >
                                        <Volume2 className="w-3 h-3 animate-pulse" />
                                        <span>إعادة النداء 🔊</span>
                                      </button>

                                      {(isDoctor || isAdmin) && (
                                        <button
                                          onClick={() => handleStatusChange(apt.id, 'COMPLETED', 'تم الكشف وصرف العلاج بنجاح')}
                                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#15803D] hover:bg-emerald-800 text-white text-2xs font-bold shadow-2xs"
                                        >
                                          <CheckCircle2 className="w-3 h-3" />
                                          <span>إتمام الكشف</span>
                                        </button>
                                      )}

                                      {(isReceptionist || isAdmin) && (
                                        <button
                                          onClick={() => {
                                            const reason = window.prompt('يرجى إدخال سبب إلغاء الحجز (اختياري):', 'انصراف المريض قبل استكمال الكشف');
                                            if (reason !== null) {
                                              handleStatusChange(apt.id, 'CANCELLED', reason || 'إلغاء بواسطة موظف الاستقبال');
                                            }
                                          }}
                                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-2xs text-red-600 hover:bg-red-50 border border-red-200"
                                          title="إلغاء الحجز"
                                        >
                                          <XCircle className="w-3 h-3 text-red-500" />
                                          <span>إلغاء</span>
                                        </button>
                                      )}
                                    </>
                                  )}

                                  {/* Action: Transfer Clinic Modal */}
                                  {apt.status !== 'CANCELLED' && apt.status !== 'COMPLETED' && (
                                    <button
                                      onClick={() => {
                                        setTransferApt(apt);
                                        const nextClinic = clinics.find((c) => c.id !== apt.clinicId);
                                        if (nextClinic) setTargetClinicId(nextClinic.id);
                                      }}
                                      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-2xs font-bold"
                                      title="تحويل المريض لعيادة أخرى"
                                    >
                                      <ArrowRightLeft className="w-3 h-3" />
                                      <span>تحويل لعيادة</span>
                                    </button>
                                  )}

                                  {apt.status === 'COMPLETED' && (
                                    <span className="text-2xs text-emerald-600 font-semibold flex items-center gap-1">
                                      <CheckCircle2 className="w-3.5 h-3.5" />
                                      <span>تم الكشف</span>
                                    </span>
                                  )}

                                  {apt.status === 'CANCELLED' && (
                                    <span className="text-2xs text-red-500 font-medium">
                                      ملغي
                                    </span>
                                  )}

                                </div>
                              </td>

                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </>
        )}

        {/* TAB 2: ADMIN CLINICS MANAGEMENT */}
        {activeTab === 'CLINICS' && isAdmin && (
          <div className="bg-white rounded-2xl border border-[#E2E8EE] p-6 shadow-2xs space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
              <div>
                <h3 className="text-lg font-bold text-[#124E4A]">إدارة العيادات وجداول التشغيل</h3>
                <p className="text-xs text-[#8493A6]">
                  إنشاء وتعديل العيادات، ضبط أيام وساعات العمل، السعة اليومية، واستثناءات التقويم والعطلات
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowCreateClinicModal(true)}
                  className="px-4 py-2 rounded-xl bg-[#087F78] hover:bg-[#066560] text-white text-xs font-bold transition-all shadow-xs flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>إضافة عيادة جديدة</span>
                </button>
                <button
                  onClick={fetchAdminClinics}
                  className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-500"
                  title="تحديث القائمة"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>
            </div>

            {loadingAdminClinics ? (
              <div className="p-8 text-center text-xs text-[#8493A6]">جاري تحميل العيادات...</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {adminClinics.map((clinic) => {
                  const dayNames = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
                  const workingDaysStr = (clinic.daysOfWeek || [])
                    .map((d) => dayNames[d])
                    .filter(Boolean)
                    .join('، ');

                  return (
                    <div
                      key={clinic.id}
                      className="p-4 rounded-xl border border-[#E2E8EE] bg-slate-50/50 hover:bg-white transition-all space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-base text-[#124E4A]">{clinic.name}</span>
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`px-2 py-0.5 rounded-full text-3xs font-bold ${
                              clinic.isHospitalConfirmed
                                ? 'bg-blue-100 text-blue-800 border border-blue-200'
                                : 'bg-amber-100 text-amber-800 border border-amber-200'
                            }`}
                          >
                            {clinic.isHospitalConfirmed ? 'معتمدة رسمياً' : 'بيانات استرشادية'}
                          </span>
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-2xs font-bold ${
                              clinic.isActive
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-red-100 text-red-800'
                            }`}
                          >
                            {clinic.isActive ? 'مفعلة ونشطة' : 'متوقفة مؤقتاً'}
                          </span>
                        </div>
                      </div>

                      {clinic.description && (
                        <p className="text-xs text-[#8493A6]">{clinic.description}</p>
                      )}

                      <div className="grid grid-cols-2 gap-2 text-2xs text-[#163C3A] pt-2 border-t border-slate-200">
                        <div>الموقع: <span className="font-semibold">{clinic.location}</span></div>
                        <div>المواعيد: <span className="font-mono">{clinic.workingHours}</span></div>
                        <div>السعة اليومية: <span className="font-bold text-[#087F78]">{clinic.maxDailySlots} مريض</span></div>
                        <div className="col-span-2">أيام العمل: <span className="font-medium text-slate-600">{workingDaysStr || 'غير محدد'}</span></div>
                      </div>

                      <div className="pt-2 flex flex-wrap items-center justify-end gap-1.5">
                        <button
                          onClick={() => openSchedulesModal(clinic)}
                          className="px-2.5 py-1.5 rounded-lg border border-teal-200 bg-teal-50 hover:bg-teal-100 text-[#087F78] text-2xs font-bold flex items-center gap-1"
                        >
                          <CalendarDays className="w-3.5 h-3.5" />
                          <span>استثناءات التقويم</span>
                        </button>

                        <button
                          onClick={() => setEditingClinic({ ...clinic })}
                          className="px-2.5 py-1.5 rounded-lg bg-[#087F78] text-white hover:bg-[#124E4A] text-2xs font-bold"
                        >
                          تعديل الإعدادات
                        </button>

                        <button
                          onClick={() => {
                            const updated = { ...clinic, isActive: !clinic.isActive };
                            handleSaveClinic(updated);
                          }}
                          className={`px-2.5 py-1.5 rounded-lg text-2xs font-bold transition-colors ${
                            clinic.isActive
                              ? 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                              : 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                          }`}
                        >
                          {clinic.isActive ? 'تعطيل مؤقت' : 'تفعيل العيادة'}
                        </button>

                        <button
                          onClick={() => handleDeleteClinic(clinic.id, clinic.name)}
                          className="p-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 text-2xs font-bold"
                          title="حذف أو إيقاف العيادة بأمان"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: ADMIN AUDIT LOGS */}
        {activeTab === 'AUDIT' && isAdmin && (
          <div className="bg-white rounded-2xl border border-[#E2E8EE] p-6 shadow-2xs space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div>
                <h3 className="text-lg font-bold text-[#124E4A]">سجل العمليات والتدقيق (Audit Logs)</h3>
                <p className="text-xs text-[#8493A6]">
                  توثيق كافة التغييرات والتحويلات وتأكيد وتعديل الحالات لضمان الشفافية
                </p>
              </div>
              <button
                onClick={fetchAuditLogs}
                className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-500"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>

            {loadingAuditLogs ? (
              <div className="p-8 text-center text-xs text-[#8493A6]">جاري تحميل السجلات...</div>
            ) : auditLogs.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">لا توجد عمليات مسجلة</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead className="bg-[#F6F9FB] border-b border-[#E2E8EE] text-[#8493A6]">
                    <tr>
                      <th className="py-2.5 px-3">التوقيت</th>
                      <th className="py-2.5 px-3">الموظف / الدور</th>
                      <th className="py-2.5 px-3">العملية</th>
                      <th className="py-2.5 px-3">التفاصيل</th>
                      <th className="py-2.5 px-3">الكود المرجعي</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E8EE]">
                    {auditLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50">
                        <td className="py-2.5 px-3 font-mono text-2xs text-slate-500">
                          {new Date(log.timestamp).toLocaleTimeString('ar-EG', {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          })}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="font-bold text-[#163C3A] block">{log.staffName}</span>
                          <span className="text-3xs text-[#8493A6]">{log.staffRole}</span>
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-[#087F78]">{log.action}</td>
                        <td className="py-2.5 px-3 text-slate-600 max-w-xs">{log.details}</td>
                        <td className="py-2.5 px-3 font-mono font-bold text-slate-700">
                          {log.referenceNumber || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 4: WEBSITE CONTENT MANAGEMENT (CMS) */}
        {activeTab === 'CMS' && isAdmin && (
          <CmsDashboard currentUser={currentUser} />
        )}

        {/* TAB 5: CANCELLATION REQUESTS MANAGEMENT */}
        {activeTab === 'CANCELLATIONS' && (isReceptionist || isAdmin) && (
          <div className="bg-white rounded-2xl border border-[#E2E8EE] p-3 sm:p-6 shadow-2xs space-y-4 sm:space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 sm:pb-4 border-b border-slate-100">
              <div>
                <h2 className="text-sm sm:text-base font-bold text-[#124E4A] flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 sm:w-5 sm:h-5 text-amber-600" />
                  <span>طلبات إلغاء المواعيد المقدمة من أولياء الأمور</span>
                </h2>
                <p className="text-2xs sm:text-xs text-[#8493A6]">
                  مراجعة طلبات الاعتذار عن الحضور والبت فيها بالقبول (إلغاء الحجز) أو الرفض (استمرار الحجز).
                </p>
              </div>

              {/* Status Filter */}
              <div className="flex items-center justify-between sm:justify-end w-full sm:w-auto gap-2">
                <span className="text-2xs sm:text-xs text-[#8493A6] shrink-0">تصفية:</span>
                <select
                  value={cancellationFilterStatus}
                  onChange={(e) => setCancellationFilterStatus(e.target.value)}
                  className="flex-1 sm:flex-initial px-3 py-1.5 rounded-xl border border-slate-200 text-xs text-slate-800 bg-white font-semibold"
                >
                  <option value="PENDING">طلبات قيد الانتظار فقط</option>
                  <option value="ALL">جميع الطلبات</option>
                  <option value="APPROVED">الطلبات المقبولة</option>
                  <option value="REJECTED">الطلبات المرفوضة</option>
                </select>
                <button
                  onClick={loadCancellationRequests}
                  className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600"
                  title="تحديث القائمة"
                >
                  <RefreshCw className={`w-4 h-4 ${loadingCancellationRequests ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            {loadingCancellationRequests ? (
              <div className="p-12 text-center text-xs text-slate-400">جاري تحميل طلبات الإلغاء...</div>
            ) : cancellationRequests.length === 0 ? (
              <div className="p-12 text-center border-2 border-dashed border-slate-200 rounded-2xl text-slate-400 text-xs">
                لا توجد طلبات إلغاء تطابق خيارات التصفية الحالية.
              </div>
            ) : (
              <>
                {/* Dedicated Mobile Cards View (Phones < 768px) */}
                <div className="block md:hidden space-y-3">
                  {cancellationRequests.map((req) => (
                    <div key={req.id} className="p-3.5 space-y-3 rounded-xl border border-slate-200 bg-white">
                      
                      {/* Top: Ref & Status */}
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono font-black text-sm text-[#124E4A]">
                          {req.referenceNumber}
                        </span>
                        {req.status === 'PENDING' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-3xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
                            <Clock className="w-3 h-3 text-amber-500 animate-pulse" />
                            <span>قيد الانتظار</span>
                          </span>
                        )}
                        {req.status === 'APPROVED' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-3xs font-bold bg-red-50 text-red-700 border border-red-200">
                            <CheckCircle2 className="w-3 h-3 text-red-500" />
                            <span>تم قبول الإلغاء</span>
                          </span>
                        )}
                        {req.status === 'REJECTED' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-3xs font-bold bg-slate-100 text-slate-700 border border-slate-300">
                            <X className="w-3 h-3 text-slate-500" />
                            <span>مرفوض (الحجز سارٍ)</span>
                          </span>
                        )}
                      </div>

                      {/* Patient & Phone */}
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-sm text-[#163C3A]">{req.patientName || '—'}</span>
                        <a
                          href={`tel:${req.phoneNumber}`}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-teal-50 text-[#087F78] text-xs font-mono font-bold border border-teal-200"
                        >
                          <Phone className="w-3 h-3" />
                          <span dir="ltr">{req.phoneNumber}</span>
                        </a>
                      </div>

                      {/* Clinic & Date */}
                      <div className="grid grid-cols-2 gap-2 text-2xs p-2 rounded-lg bg-slate-50 border border-slate-100">
                        <div>
                          <span className="text-[#8493A6] block text-3xs">العيادة</span>
                          <span className="font-bold text-[#087F78] block truncate">{req.clinicName || '—'}</span>
                        </div>
                        <div>
                          <span className="text-[#8493A6] block text-3xs">تاريخ الحجز</span>
                          <span className="font-semibold text-[#163C3A] block truncate">
                            {req.appointmentDate ? formatArabicDate(req.appointmentDate) : '—'}
                          </span>
                        </div>
                      </div>

                      {/* Reason */}
                      <div className="p-2.5 rounded-lg bg-amber-50/50 border border-amber-200 text-2xs space-y-1">
                        <span className="text-amber-800 font-bold block text-3xs">
                          سبب الإلغاء ({new Date(req.requestedAt).toLocaleDateString('ar-EG', { dateStyle: 'short', timeStyle: 'short' })}):
                        </span>
                        <p className="text-slate-700 italic">"{req.reason || 'طلب إلغاء من ولي الأمر'}"</p>
                      </div>

                      {/* Decision Actions */}
                      <div className="pt-2 border-t border-slate-100">
                        {req.status === 'PENDING' ? (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => {
                                setReviewingReqId(req.id);
                                setReviewDecision('APPROVED');
                                setReviewReason('');
                              }}
                              className="flex-1 py-2.5 px-3 rounded-xl text-xs font-bold bg-red-600 hover:bg-red-700 text-white shadow-2xs transition-colors flex items-center justify-center gap-1"
                            >
                              <CheckCircle2 className="w-4 h-4" />
                              <span>قبول وإلغاء الحجز</span>
                            </button>
                            <button
                              onClick={() => {
                                setReviewingReqId(req.id);
                                setReviewDecision('REJECTED');
                                setReviewReason('الحجز سارٍ ومطلوب الحضور');
                              }}
                              className="py-2.5 px-3 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 transition-colors flex items-center justify-center gap-1 shrink-0"
                            >
                              <X className="w-4 h-4" />
                              <span>رفض الطلب</span>
                            </button>
                          </div>
                        ) : (
                          <div className="text-3xs text-slate-500 text-center py-1">
                            <span>تمت المراجعة بواسطة {req.reviewedByName || 'الموظف'}</span>
                            {req.rejectionReason && (
                              <span className="block text-slate-400 mt-0.5">السبب: {req.rejectionReason}</span>
                            )}
                          </div>
                        )}
                      </div>

                    </div>
                  ))}
                </div>

                {/* Desktop Table View (>= 768px md) */}
                <div className="hidden md:block overflow-x-auto border border-[#E2E8EE] rounded-xl">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-[#F6F9FB] border-b border-[#E2E8EE] text-[#8493A6]">
                      <tr>
                        <th className="py-3 px-4 font-bold">رقم الحجز</th>
                        <th className="py-3 px-4 font-bold">المريض ورقم الهاتف</th>
                        <th className="py-3 px-4 font-bold">العيادة وتاريخ الحجز</th>
                        <th className="py-3 px-4 font-bold">تاريخ الطلب والسبب</th>
                        <th className="py-3 px-4 font-bold">حالة الطلب</th>
                        <th className="py-3 px-4 font-bold text-center">القرار والإجراء</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E2E8EE]">
                      {cancellationRequests.map((req) => (
                        <tr key={req.id} className="hover:bg-slate-50/70">
                          <td className="py-3 px-4 font-mono font-bold text-[#124E4A]">
                            {req.referenceNumber}
                          </td>
                          <td className="py-3 px-4">
                            <span className="font-bold text-[#163C3A] block">{req.patientName || '—'}</span>
                            <span className="font-mono text-2xs text-[#8493A6]" dir="ltr">{req.phoneNumber}</span>
                          </td>
                          <td className="py-3 px-4">
                            <span className="font-semibold text-[#087F78] block">{req.clinicName || '—'}</span>
                            <span className="text-2xs text-[#8493A6]">
                              {req.appointmentDate ? formatArabicDate(req.appointmentDate) : '—'}
                            </span>
                          </td>
                          <td className="py-3 px-4 max-w-xs">
                            <span className="text-2xs text-slate-400 block">
                              {new Date(req.requestedAt).toLocaleDateString('ar-EG', { dateStyle: 'short', timeStyle: 'short' })}
                            </span>
                            <span className="text-xs text-slate-700 block italic">
                              "{req.reason || 'طلب إلغاء من ولي الأمر'}"
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            {req.status === 'PENDING' && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-2xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                <Clock className="w-3 h-3 text-amber-500 animate-pulse" />
                                <span>قيد الانتظار</span>
                              </span>
                            )}
                            {req.status === 'APPROVED' && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-2xs font-bold bg-red-50 text-red-700 border border-red-200">
                                <CheckCircle2 className="w-3 h-3 text-red-500" />
                                <span>تم قبول الإلغاء</span>
                              </span>
                            )}
                            {req.status === 'REJECTED' && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-2xs font-bold bg-slate-100 text-slate-700 border border-slate-300">
                                <X className="w-3 h-3 text-slate-500" />
                                <span>طلب مرفوض (سارٍ)</span>
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center">
                            {req.status === 'PENDING' ? (
                              <div className="flex items-center justify-center gap-2">
                                <button
                                  onClick={() => {
                                    setReviewingReqId(req.id);
                                    setReviewDecision('APPROVED');
                                    setReviewReason('');
                                  }}
                                  className="px-3 py-1.5 rounded-lg text-2xs font-bold bg-red-600 hover:bg-red-700 text-white shadow-2xs transition-colors cursor-pointer"
                                >
                                  موافقة وإلغاء الحجز
                                </button>
                                <button
                                  onClick={() => {
                                    setReviewingReqId(req.id);
                                    setReviewDecision('REJECTED');
                                    setReviewReason('الحجز سارٍ ومطلوب الحضور');
                                  }}
                                  className="px-3 py-1.5 rounded-lg text-2xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 transition-colors cursor-pointer"
                                >
                                  رفض الطلب
                                </button>
                              </div>
                            ) : (
                              <div className="text-3xs text-slate-500 text-center">
                                <span>بواسطة {req.reviewedByName || 'الموظف'}</span>
                                {req.rejectionReason && (
                                  <span className="block text-slate-400">السبب: {req.rejectionReason}</span>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}

      </main>

      {/* MODAL 1: TRANSFER CLINIC */}
      {transferApt && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-2xl sm:rounded-3xl max-w-md w-full p-4 sm:p-6 text-right shadow-xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95 duration-150 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-sm sm:text-base font-bold text-[#124E4A] flex items-center gap-2">
                <ArrowRightLeft className="w-4 h-4 text-[#087F78]" />
                <span>تحويل حجز مريض لعيادة أخرى</span>
              </h3>
              <button
                onClick={() => setTransferApt(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-slate-50 p-3 rounded-xl text-xs space-y-1">
              <div>المريض: <span className="font-bold text-[#163C3A]">{transferApt.patientName}</span></div>
              <div>العيادة الحالية: <span className="font-bold text-red-700">{transferApt.clinicName}</span></div>
              <div>رقم الدور الحالي: <span className="font-mono font-bold">#{transferApt.queueNumber}</span></div>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#163C3A] mb-1.5">
                اختر العيادة المحول إليها <span className="text-red-500">*</span>
              </label>
              <select
                value={targetClinicId}
                onChange={(e) => setTargetClinicId(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-[#E2E8EE] text-sm font-bold text-[#124E4A] bg-white focus:border-[#087F78]"
              >
                {clinics
                  .filter((c) => c.id !== transferApt.clinicId)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.location})
                    </option>
                  ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#163C3A] mb-1.5">
                سبب التحويل / الملاحظات الطبية
              </label>
              <textarea
                rows={2}
                value={transferReason}
                onChange={(e) => setTransferReason(e.target.value)}
                placeholder="مثال: توصية استشاري الأطفال بإجراء فحص إيكو للقلب أولاً..."
                className="w-full px-3 py-2 rounded-xl border border-[#E2E8EE] text-sm text-[#163C3A] focus:border-[#087F78] placeholder:text-[#8493A6]"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => setTransferApt(null)}
                className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
              >
                إلغاء
              </button>
              <button
                disabled={isTransferring}
                onClick={handleConfirmTransfer}
                className="px-5 py-2.5 rounded-xl text-xs font-bold bg-[#087F78] hover:bg-[#124E4A] text-white shadow-xs"
              >
                {isTransferring ? 'جاري التحويل...' : 'تأكيد التحويل الآن'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: WALK-IN BOOKING */}
      {showWalkInModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-2xl sm:rounded-3xl max-w-lg w-full p-4 sm:p-6 text-right shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95 duration-150 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-sm sm:text-base font-bold text-[#124E4A] flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-amber-500" />
                <span>تسجيل حجز حضوري (مكتب الاستقبال)</span>
              </h3>
              <button
                onClick={() => setShowWalkInModal(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {walkInError && (
              <div className="p-3 rounded-xl bg-red-50 text-red-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{walkInError}</span>
              </div>
            )}

            <form onSubmit={handleWalkInSubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-[#163C3A] mb-1">
                  اسم الطفل (رباعي) <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={walkInPatientName}
                  onChange={(e) => setWalkInPatientName(e.target.value)}
                  placeholder="الاسم رباعي"
                  className="w-full px-3 py-2.5 rounded-xl border border-[#E2E8EE] text-sm text-[#163C3A] focus:border-[#087F78]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#163C3A] mb-1">
                    رقم الهاتف <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="tel"
                    required
                    dir="ltr"
                    value={walkInPhone}
                    onChange={(e) => setWalkInPhone(e.target.value)}
                    placeholder="01xxxxxxxxx"
                    className="w-full px-3 py-2.5 rounded-xl border border-[#E2E8EE] text-sm text-right font-mono focus:border-[#087F78]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#163C3A] mb-1">
                    العيادة المطلوبة <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={walkInClinicId}
                    onChange={(e) => setWalkInClinicId(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-[#E2E8EE] text-sm font-semibold text-[#124E4A] bg-white focus:border-[#087F78]"
                  >
                    {clinics.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Service Selection for Selected Clinic */}
              <div>
                <label className="block text-xs font-bold text-[#163C3A] mb-1">
                  الخدمة الطبية المطلوبة
                </label>
                <select
                  value={walkInServiceId}
                  onChange={(e) => setWalkInServiceId(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-[#E2E8EE] text-sm font-semibold text-[#124E4A] bg-white focus:border-[#087F78]"
                >
                  <option value="">كشف واستشارة طبية عامة (افتراضي)</option>
                  {walkInServicesList.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} {s.maxDailyCapacity ? `(السعة اليومية: ${s.maxDailyCapacity} مريض)` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Date Selection: Today or Future Date */}
              <div>
                <label className="block text-xs font-bold text-[#163C3A] mb-1">
                  تاريخ الكشف (اليوم أو تاريخ مستقبلي) <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  min={formatLocalDate()}
                  value={walkInAppointmentDate || formatLocalDate()}
                  onChange={(e) => setWalkInAppointmentDate(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-[#E2E8EE] text-sm font-bold text-[#124E4A] bg-white focus:border-[#087F78]"
                />
                {(() => {
                  const selClinic = clinics.find((c) => c.id === walkInClinicId);
                  const dayNames = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
                  const workingDaysStr = (selClinic?.daysOfWeek || [])
                    .map((d) => dayNames[d])
                    .filter(Boolean)
                    .join('، ');
                  return workingDaysStr ? (
                    <span className="block text-[11px] text-teal-700 mt-1">
                      أيام عمل العيادة الرسمية: <strong>{workingDaysStr}</strong>
                    </span>
                  ) : null;
                })()}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#163C3A] mb-1">السن</label>
                  <input
                    type="text"
                    value={walkInAge}
                    onChange={(e) => setWalkInAge(e.target.value)}
                    placeholder="مثال: 4 سنوات"
                    className="w-full px-3 py-2.5 rounded-xl border border-[#E2E8EE] text-sm focus:border-[#087F78]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#163C3A] mb-1">العنوان</label>
                  <input
                    type="text"
                    value={walkInAddress}
                    onChange={(e) => setWalkInAddress(e.target.value)}
                    placeholder="مثال: أبو حمص - دمسنا"
                    className="w-full px-3 py-2.5 rounded-xl border border-[#E2E8EE] text-sm focus:border-[#087F78]"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowWalkInModal(false)}
                  className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={walkInSubmitting}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold bg-[#087F78] hover:bg-[#066560] text-white shadow-xs cursor-pointer flex items-center gap-1.5"
                >
                  {walkInSubmitting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>جاري التسجيل...</span>
                    </>
                  ) : (
                    <span>تسجيل وحفظ الحجز وإصدار الإيصال</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2.5: WALK-IN SUCCESS PRINTABLE RECEIPT */}
      {walkInSuccessReceipt && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-2xl sm:rounded-3xl max-w-lg w-full p-4 sm:p-6 text-right shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95 duration-150 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 no-print">
              <h3 className="text-base font-bold text-[#124E4A] flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <span>تم تسجيل وتأكيد الحجز الحضوري بنجاح</span>
              </h3>
              <button
                onClick={() => setWalkInSuccessReceipt(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Printable Receipt Card */}
            <div
              id="printable-walkin-receipt"
              className="bg-white rounded-2xl border-2 border-teal-600/30 p-5 space-y-4 text-xs"
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                <div>
                  <h4 className="text-base font-black text-[#124E4A]">مستشفى الأطفال التخصصي بالبحيرة</h4>
                  <p className="text-[11px] text-slate-500">إيصال حجز كشف حضوري معتمد</p>
                </div>
                <div className="text-left font-mono">
                  <span className="text-[10px] text-slate-400 block font-semibold">رقم التذكرة</span>
                  <span className="text-sm font-black text-[#087F78]">{walkInSuccessReceipt.referenceNumber}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-slate-400 block text-[10.5px]">اسم المريض</span>
                  <strong className="text-sm text-[#163C3A]">{walkInSuccessReceipt.patientName}</strong>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10.5px]">رقم الهاتف</span>
                  <strong className="text-xs font-mono text-[#163C3A]">{walkInSuccessReceipt.phoneNumber}</strong>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10.5px]">العيادة</span>
                  <strong className="text-xs text-[#163C3A]">{walkInSuccessReceipt.clinicName}</strong>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10.5px]">الخدمة</span>
                  <strong className="text-xs text-[#087F78]">{walkInSuccessReceipt.serviceName || 'كشف واستشارة طبية'}</strong>
                </div>
                <div className="p-2.5 rounded-xl bg-teal-50 border border-teal-100 col-span-2">
                  <span className="text-[10.5px] font-bold text-[#087F78] block">تاريخ الكشف المحدد</span>
                  <strong className="text-xs sm:text-sm font-bold text-[#124E4A]">
                    {formatArabicDate(walkInSuccessReceipt.appointmentDate)} — الحضور صباحاً بأسبقية الحضور
                  </strong>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10.5px]">حالة الإيصال</span>
                  <strong className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-black bg-emerald-100 text-emerald-800 border border-emerald-300">
                    مؤكد
                  </strong>
                </div>
                {walkInSuccessReceipt.patientAge && (
                  <div>
                    <span className="text-slate-400 block text-[10.5px]">السن</span>
                    <strong className="text-xs text-[#163C3A]">{walkInSuccessReceipt.patientAge}</strong>
                  </div>
                )}
              </div>

              {walkInSuccessReceipt.requiredDocuments && walkInSuccessReceipt.requiredDocuments.length > 0 && (
                <div className="pt-2.5 border-t border-slate-100 text-xs">
                  <span className="font-bold text-[#124E4A] block mb-1">الأوراق والمستندات المطلوبة:</span>
                  <ul className="list-disc list-inside space-y-0.5 text-slate-600 text-[11px]">
                    {walkInSuccessReceipt.requiredDocuments.map((doc, idx) => (
                      <li key={idx}>{doc}</li>
                    ))}
                  </ul>
                </div>
              )}

              {walkInSuccessReceipt.serviceInstructions && (
                <div className="pt-2 border-t border-slate-100 text-xs">
                  <span className="font-bold text-[#124E4A] block mb-0.5">تعليمات وإرشادات الحضور:</span>
                  <p className="text-slate-600 text-[11px] leading-relaxed">{walkInSuccessReceipt.serviceInstructions}</p>
                </div>
              )}

              <div className="pt-3 border-t border-slate-100 text-center text-[10px] text-slate-400">
                أبو حمص – دمسنا – محافظة البحيرة • مستشفى الأطفال التخصصي
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 no-print">
              <button
                type="button"
                onClick={() => setWalkInSuccessReceipt(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                إغلاق
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-[#087F78] hover:bg-[#066560] text-white shadow-xs flex items-center gap-1.5 cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>طباعة الإيصال فوراً</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: EDIT CLINIC (ADMIN) */}
      {editingClinic && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-2xl sm:rounded-3xl max-w-lg w-full max-h-[92vh] overflow-y-auto p-4 sm:p-6 text-right shadow-xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-sm sm:text-base font-bold text-[#124E4A] flex items-center gap-2">
                <Sliders className="w-5 h-5 text-[#087F78]" />
                <span>تعديل إعدادات {editingClinic.name}</span>
              </h3>
              <button
                onClick={() => setEditingClinic(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-[#163C3A] mb-1">اسم العيادة</label>
                <input
                  type="text"
                  value={editingClinic.name}
                  onChange={(e) => setEditingClinic({ ...editingClinic, name: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-xl border border-[#E2E8EE] text-sm focus:border-[#087F78]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#163C3A] mb-1">الموقع الداخلي</label>
                <input
                  type="text"
                  value={editingClinic.location}
                  onChange={(e) => setEditingClinic({ ...editingClinic, location: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-xl border border-[#E2E8EE] text-sm focus:border-[#087F78]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#163C3A] mb-1">السعة اليومية القصوى</label>
                  <input
                    type="number"
                    value={editingClinic.maxDailySlots}
                    onChange={(e) => setEditingClinic({ ...editingClinic, maxDailySlots: Number(e.target.value) })}
                    className="w-full px-3 py-2.5 rounded-xl border border-[#E2E8EE] text-sm font-mono focus:border-[#087F78]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#163C3A] mb-1">مواعيد العمل</label>
                  <input
                    type="text"
                    value={editingClinic.workingHours}
                    onChange={(e) => setEditingClinic({ ...editingClinic, workingHours: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-xl border border-[#E2E8EE] text-sm font-mono focus:border-[#087F78]"
                  />
                </div>
              </div>

              {/* Weekly Working Days Checkboxes */}
              <div>
                <label className="block text-xs font-bold text-[#163C3A] mb-1.5">
                  أيام العمل الأسبوعية الرسمية
                </label>
                <div className="grid grid-cols-4 gap-2 bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs">
                  {[
                    { id: 6, label: 'السبت' },
                    { id: 0, label: 'الأحد' },
                    { id: 1, label: 'الإثنين' },
                    { id: 2, label: 'الثلاثاء' },
                    { id: 3, label: 'الأربعاء' },
                    { id: 4, label: 'الخميس' },
                    { id: 5, label: 'الجمعة' },
                  ].map((day) => {
                    const isChecked = (editingClinic.daysOfWeek || []).includes(day.id);
                    return (
                      <label key={day.id} className="flex items-center gap-1.5 cursor-pointer text-2xs font-bold text-slate-700">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            const cur = editingClinic.daysOfWeek || [];
                            const updated = e.target.checked
                              ? [...cur, day.id].sort()
                              : cur.filter((d) => d !== day.id);
                            setEditingClinic({ ...editingClinic, daysOfWeek: updated });
                          }}
                          className="rounded border-slate-300 text-[#087F78] focus:ring-[#087F78]"
                        />
                        <span>{day.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#163C3A] mb-1">
                  المستندات المطلوبة للعيادة (مستند في كل سطر)
                </label>
                <textarea
                  rows={2}
                  value={(editingClinic.requiredDocuments || []).join('\n')}
                  onChange={(e) =>
                    setEditingClinic({
                      ...editingClinic,
                      requiredDocuments: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean),
                    })
                  }
                  placeholder="أصل شهادة ميلاد الطفل أو بطاقة التأمين الصحي&#10;صورة بطاقة ولي الأمر..."
                  className="w-full px-3 py-2 rounded-xl border border-[#E2E8EE] text-sm focus:border-[#087F78] placeholder:text-slate-400 resize-y"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#163C3A] mb-1">
                  تعليمات وإرشادات العيادة العامة
                </label>
                <textarea
                  rows={2}
                  value={editingClinic.instructions || ''}
                  onChange={(e) => setEditingClinic({ ...editingClinic, instructions: e.target.value })}
                  placeholder="اكتب التعليمات والتحاليل أو الفحوصات المطلوبة من ولي الأمر عند الحضور..."
                  className="w-full px-3 py-2 rounded-xl border border-[#E2E8EE] text-sm focus:border-[#087F78] placeholder:text-slate-400 resize-y"
                />
              </div>

              <div>
                <label className="flex items-center gap-2 cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={editingClinic.isHospitalConfirmed ?? false}
                    onChange={(e) => setEditingClinic({ ...editingClinic, isHospitalConfirmed: e.target.checked })}
                    className="rounded border-slate-300 text-[#087F78] focus:ring-[#087F78]"
                  />
                  <span className="text-xs font-bold text-[#163C3A]">اعتماد بيانات العيادة رسمياً من إدارة المستشفى</span>
                </label>
              </div>

              {/* CLINIC SERVICES MANAGEMENT SECTION */}
              <div className="pt-4 border-t border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black text-[#124E4A] flex items-center gap-1.5">
                    <Stethoscope className="w-4 h-4 text-[#087F78]" />
                    <span>خدمات العيادة المتوفرة ({editingClinicServices.length})</span>
                  </h4>
                  <span className="text-3xs text-slate-400">إضافة وحذف وتعديل خدمات العيادة</span>
                </div>

                {loadingClinicServices ? (
                  <div className="p-4 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>جاري تحميل الخدمات...</span>
                  </div>
                ) : editingClinicServices.length === 0 ? (
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-center text-2xs text-slate-500">
                    لا توجد خدمات مسجلة لهذه العيادة حالياً. يمكنك إضافة خدمة جديدة أدناه.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                    {editingClinicServices.map((service) => (
                      <div
                        key={service.id}
                        className="p-3 rounded-xl border border-slate-200 bg-slate-50/70 flex items-start justify-between gap-3 text-xs"
                      >
                        <div className="space-y-0.5 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-[#163C3A]">{service.name}</span>
                            {service.maxDailyCapacity && (
                              <span className="px-2 py-0.5 rounded-md bg-teal-50 text-[#087F78] text-3xs font-bold font-mono">
                                سعة: {service.maxDailyCapacity} مريض/يوم
                              </span>
                            )}
                          </div>
                          {service.instructions && (
                            <p className="text-3xs text-slate-500 line-clamp-1">{service.instructions}</p>
                          )}
                          {service.requiredDocuments && service.requiredDocuments.length > 0 && (
                            <p className="text-3xs text-slate-400">
                              الأوراق: {service.requiredDocuments.join('، ')}
                            </p>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => handleDeleteServiceFromClinic(service.id)}
                          disabled={deletingServiceId === service.id}
                          className="px-2.5 py-1 text-2xs font-bold text-red-600 hover:bg-red-50 rounded-lg border border-red-200 transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50 shrink-0"
                          title="حذف الخدمة"
                        >
                          {deletingServiceId === service.id ? (
                            <RefreshCw className="w-3 h-3 animate-spin" />
                          ) : (
                            <Trash2 className="w-3 h-3" />
                          )}
                          <span>حذف</span>
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* ADD NEW SERVICE INLINE FORM */}
                <div className="p-3.5 bg-teal-50/50 border border-teal-200/70 rounded-xl space-y-2 text-xs">
                  <span className="font-bold text-[#124E4A] block">إضافة خدمة جديدة لهذه العيادة:</span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <label className="block text-3xs text-slate-600 mb-0.5">اسم الخدمة *</label>
                      <input
                        type="text"
                        value={newServiceName}
                        onChange={(e) => setNewServiceName(e.target.value)}
                        placeholder="مثال: فحص دوري، رسم قلب"
                        className="w-full px-2.5 py-2 rounded-lg border border-teal-200 text-sm bg-white focus:border-[#087F78]"
                      />
                    </div>
                    <div>
                      <label className="block text-3xs text-slate-600 mb-0.5">الطاقة الاستيعابية اليومية</label>
                      <input
                        type="number"
                        min="1"
                        value={newServiceCapacity}
                        onChange={(e) => setNewServiceCapacity(Number(e.target.value))}
                        className="w-full px-2.5 py-2 rounded-lg border border-teal-200 text-sm font-mono bg-white focus:border-[#087F78]"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-3xs text-slate-600 mb-0.5">المستندات المطلوبة (مستند في كل سطر)</label>
                    <textarea
                      rows={1}
                      value={newServiceDocs}
                      onChange={(e) => setNewServiceDocs(e.target.value)}
                      placeholder="شهادة الميلاد، إحالة التأمين..."
                      className="w-full px-2.5 py-2 rounded-lg border border-teal-200 text-sm bg-white resize-y"
                    />
                  </div>
                  <div>
                    <label className="block text-3xs text-slate-600 mb-0.5">تعليمات التحضير الخاصة بالخدمة</label>
                    <input
                      type="text"
                      value={newServiceInstructions}
                      onChange={(e) => setNewServiceInstructions(e.target.value)}
                      placeholder="مثال: صيام 6 ساعات قبل الفحص..."
                      className="w-full px-2.5 py-2 rounded-lg border border-teal-200 text-sm bg-white"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleAddServiceToClinic}
                    disabled={addingServiceLoading || !newServiceName.trim()}
                    className="w-full py-2.5 rounded-xl bg-[#087F78] hover:bg-[#066560] text-white text-xs font-bold transition-all shadow-2xs flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
                  >
                    {addingServiceLoading ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>جاري الإضافة...</span>
                      </>
                    ) : (
                      <>
                        <Plus className="w-3.5 h-3.5" />
                        <span>إضافة الخدمة للعيادة</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setEditingClinic(null)}
                className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={() => handleSaveClinic(editingClinic)}
                className="px-5 py-2.5 rounded-xl text-xs font-bold bg-[#087F78] hover:bg-[#124E4A] text-white shadow-xs"
              >
                حفظ التعديلات
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: CREATE CLINIC (ADMIN) */}
      {showCreateClinicModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-2xl sm:rounded-3xl max-w-lg w-full max-h-[92vh] overflow-y-auto p-4 sm:p-6 text-right shadow-xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-sm sm:text-base font-bold text-[#124E4A] flex items-center gap-2">
                <Plus className="w-5 h-5 text-[#087F78]" />
                <span>إضافة عيادة تخصصية جديدة</span>
              </h3>
              <button
                onClick={() => setShowCreateClinicModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateClinic} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-[#163C3A] mb-1">
                  اسم العيادة <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newClinicName}
                  onChange={(e) => setNewClinicName(e.target.value)}
                  placeholder="مثال: عيادة السمعيات، عيادة حساسية الصدر..."
                  className="w-full px-3 py-2.5 rounded-xl border border-[#E2E8EE] text-sm focus:border-[#087F78]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#163C3A] mb-1">
                  الموقع الداخلي بالمستشفى <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newClinicLocation}
                  onChange={(e) => setNewClinicLocation(e.target.value)}
                  placeholder="مثال: الدور الأول - مبنى العيادات الخارجية"
                  className="w-full px-3 py-2.5 rounded-xl border border-[#E2E8EE] text-sm focus:border-[#087F78]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#163C3A] mb-1">السعة اليومية للعيادة</label>
                  <input
                    type="number"
                    min="1"
                    value={newClinicCapacity}
                    onChange={(e) => setNewClinicCapacity(Number(e.target.value))}
                    className="w-full px-3 py-2.5 rounded-xl border border-[#E2E8EE] text-sm font-mono focus:border-[#087F78]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#163C3A] mb-1">مواعيد العمل الرسمية</label>
                  <input
                    type="text"
                    value={newClinicHours}
                    onChange={(e) => setNewClinicHours(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-[#E2E8EE] text-sm font-mono focus:border-[#087F78]"
                  />
                </div>
              </div>

              {/* Days of Week */}
              <div>
                <label className="block text-xs font-bold text-[#163C3A] mb-1.5">
                  أيام العمل الأسبوعية
                </label>
                <div className="grid grid-cols-4 gap-2 bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs">
                  {[
                    { id: 6, label: 'السبت' },
                    { id: 0, label: 'الأحد' },
                    { id: 1, label: 'الإثنين' },
                    { id: 2, label: 'الثلاثاء' },
                    { id: 3, label: 'الأربعاء' },
                    { id: 4, label: 'الخميس' },
                    { id: 5, label: 'الجمعة' },
                  ].map((day) => {
                    const isChecked = newClinicDays.includes(day.id);
                    return (
                      <label key={day.id} className="flex items-center gap-1.5 cursor-pointer text-2xs font-bold text-slate-700">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            const updated = e.target.checked
                              ? [...newClinicDays, day.id].sort()
                              : newClinicDays.filter((d) => d !== day.id);
                            setNewClinicDays(updated);
                          }}
                          className="rounded border-slate-300 text-[#087F78] focus:ring-[#087F78]"
                        />
                        <span>{day.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#163C3A] mb-1">
                  المستندات المطلوبة للعيادة (مستند في كل سطر)
                </label>
                <textarea
                  rows={2}
                  value={newClinicDocs}
                  onChange={(e) => setNewClinicDocs(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-[#E2E8EE] text-sm focus:border-[#087F78]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#163C3A] mb-1">
                  تعليمات وإرشادات العيادة
                </label>
                <textarea
                  rows={2}
                  value={newClinicInstructions}
                  onChange={(e) => setNewClinicInstructions(e.target.value)}
                  placeholder="الحضور صباحاً والتسجيل بأسبقية الحضور لشباك الاستقبال بالمستشفى..."
                  className="w-full px-3 py-2.5 rounded-xl border border-[#E2E8EE] text-sm focus:border-[#087F78]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowCreateClinicModal(false)}
                  className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={creatingClinic}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold bg-[#087F78] hover:bg-[#124E4A] text-white shadow-xs"
                >
                  {creatingClinic ? 'جاري الإنشاء...' : 'إضافة العيادة الآن'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 5: CALENDAR SCHEDULE EXCEPTIONS & CLOSURES (ADMIN) */}
      {managingSchedulesClinic && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-2xl sm:rounded-3xl max-w-lg w-full max-h-[92vh] overflow-y-auto p-4 sm:p-6 text-right shadow-xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-[#124E4A] flex items-center gap-2">
                <CalendarDays className="w-5 h-5 text-[#087F78]" />
                <span>استثناءات التقويم والعطلات — {managingSchedulesClinic.name}</span>
              </h3>
              <button
                onClick={() => setManagingSchedulesClinic(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Add Exception Form */}
            <form onSubmit={handleSaveScheduleException} className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
              <span className="text-xs font-bold text-[#124E4A] block">إضافة استثناء تقويم جديد (عطلة أو تشغيل إضافي):</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-2xs font-bold text-slate-700 mb-1">التاريخ المحدد</label>
                  <input
                    type="date"
                    required
                    value={newExceptionDate}
                    onChange={(e) => setNewExceptionDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-mono bg-white"
                  />
                </div>
                <div>
                  <label className="block text-2xs font-bold text-slate-700 mb-1">نوع الاستثناء</label>
                  <select
                    value={newExceptionIsClosed ? 'CLOSED' : 'OPEN'}
                    onChange={(e) => setNewExceptionIsClosed(e.target.value === 'CLOSED')}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold bg-white"
                  >
                    <option value="CLOSED">إغلاق عطلة رسمية أو طارئة</option>
                    <option value="OPEN">تشغيل استثنائي / سعة خاصة</option>
                  </select>
                </div>
              </div>

              {newExceptionIsClosed ? (
                <div>
                  <label className="block text-2xs font-bold text-slate-700 mb-1">سبب الإغلاق</label>
                  <input
                    type="text"
                    value={newExceptionReason}
                    onChange={(e) => setNewExceptionReason(e.target.value)}
                    placeholder="مثال: عطلة المولد النبوي، صيانة طارئة..."
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs bg-white"
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-2xs font-bold text-slate-700 mb-1">السعة الاستثنائية لهذا اليوم</label>
                  <input
                    type="number"
                    min="1"
                    value={newExceptionCapacity}
                    onChange={(e) => setNewExceptionCapacity(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-mono bg-white"
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={savingException}
                className="w-full py-2 rounded-xl bg-[#087F78] hover:bg-[#066560] text-white text-xs font-bold transition-all shadow-xs"
              >
                {savingException ? 'جاري الحفظ...' : 'حفظ استثناء التقويم'}
              </button>
            </form>

            {/* List of existing exceptions */}
            <div className="space-y-2">
              <span className="text-xs font-bold text-[#124E4A] block">الاستثناءات والعطلات المسجلة:</span>
              {loadingSchedules ? (
                <div className="p-4 text-center text-xs text-slate-400">جاري تحميل الاستثناءات...</div>
              ) : clinicSchedulesList.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-400 bg-slate-50 rounded-xl border border-slate-100">
                  لا توجد استثناءات مسجلة (العيادة تعمل وفق جدولها الأسبوعي الافتراضي).
                </div>
              ) : (
                <div className="space-y-2">
                  {clinicSchedulesList.map((sched) => (
                    <div
                      key={sched.id || sched.scheduleDate}
                      className="p-3 rounded-xl border border-slate-200 bg-white flex items-center justify-between text-xs"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <strong className="font-mono text-sm text-[#124E4A]">{sched.scheduleDate}</strong>
                          <span
                            className={`px-2 py-0.5 rounded-full text-3xs font-bold ${
                              sched.isClosed ? 'bg-red-100 text-red-800' : 'bg-emerald-100 text-emerald-800'
                            }`}
                          >
                            {sched.isClosed ? 'مغلقة (عطلة)' : `تشغيل بسعة ${sched.maxCapacity}`}
                          </span>
                        </div>
                        {sched.closureReason && (
                          <p className="text-2xs text-slate-500 mt-0.5">{sched.closureReason}</p>
                        )}
                      </div>

                      <button
                        onClick={() => handleDeleteScheduleException(sched.scheduleDate)}
                        className="text-red-500 hover:text-red-700 p-1.5 rounded-lg hover:bg-red-50 transition-colors"
                        title="حذف الاستثناء والعودة للجدول الأسبوعي"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-slate-100 text-left">
              <button
                type="button"
                onClick={() => setManagingSchedulesClinic(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
              >
                إغلاق النافذة
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: REVIEW CANCELLATION REQUEST */}
      {reviewingReqId && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-2xl sm:rounded-3xl max-w-md w-full p-4 sm:p-6 text-right shadow-xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95 duration-150 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-sm sm:text-base font-bold text-[#163C3A] flex items-center gap-2">
                {reviewDecision === 'APPROVED' ? (
                  <>
                    <AlertCircle className="w-5 h-5 text-red-500" />
                    <span className="text-red-600">تأكيد الموافقة على إلغاء الحجز</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    <span className="text-emerald-700">تأكيد رفض طلب الإلغاء واستمرار الحجز</span>
                  </>
                )}
              </h3>
              <button
                onClick={() => setReviewingReqId(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              {reviewDecision === 'APPROVED'
                ? 'عند الموافقة، سيتم إلغاء الحجز نهائياً ونقل حالته إلى (CANCELLED) وإتاحة الدور في سجلات العيادة.'
                : 'عند رفض الطلب، سيظل الحجز فعالاً وسارياً بحالته السابقة وسيتم توثيق استمرار الحجز.'}
            </p>

            <div>
              <label className="block text-2xs font-bold text-[#163C3A] mb-1">
                ملاحظات القرار (اختياري)
              </label>
              <input
                type="text"
                value={reviewReason}
                onChange={(e) => setReviewReason(e.target.value)}
                placeholder={reviewDecision === 'APPROVED' ? 'سبب الموافقة على الإلغاء...' : 'سبب رفض طلب الإلغاء...'}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-800 focus:border-[#087F78]"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setReviewingReqId(null)}
                className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
              >
                تراجع
              </button>
              <button
                type="button"
                onClick={() => handleReviewCancellation(reviewingReqId, reviewDecision, reviewReason)}
                disabled={isSubmittingReview}
                className={`px-5 py-2.5 rounded-xl text-xs font-bold text-white shadow-xs disabled:opacity-60 flex items-center gap-1.5 ${
                  reviewDecision === 'APPROVED' ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
              >
                {isSubmittingReview ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>جاري التنفيذ...</span>
                  </>
                ) : (
                  <span>{reviewDecision === 'APPROVED' ? 'تأكيد إلغاء الحجز' : 'تأكيد استمرار الحجز'}</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
