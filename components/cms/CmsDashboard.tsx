'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Globe,
  Building2,
  Layers,
  Menu,
  FileText,
  Sliders,
  Search,
  Image as ImageIcon,
  ExternalLink,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  BellRing,
} from 'lucide-react';
import type { CmsFullPayload, MediaAsset } from '@/types/cms';
import IdentityEditor from './IdentityEditor';
import HomepageEditor from './HomepageEditor';
import NavbarEditor from './NavbarEditor';
import FooterEditor from './FooterEditor';
import ClinicsPresentationEditor from './ClinicsPresentationEditor';
import SeoEditor from './SeoEditor';
import MediaManager from './MediaManager';
import PushNotificationEditor from './PushNotificationEditor';
import AnnouncementManager from './AnnouncementManager';

interface CmsDashboardProps {
  currentUser?: {
    id: string;
    name: string;
    role: string;
  } | null;
}

type CmsSubTab =
  | 'IDENTITY'
  | 'HOMEPAGE'
  | 'NAVBAR'
  | 'FOOTER'
  | 'CLINICS'
  | 'SEO'
  | 'MEDIA'
  | 'ANNOUNCEMENTS'
  | 'NOTIFICATIONS';

export default function CmsDashboard({ currentUser }: CmsDashboardProps) {
  const [activeSubTab, setActiveSubTab] = useState<CmsSubTab>('IDENTITY');
  const [data, setData] = useState<(CmsFullPayload & { assets: MediaAsset[] }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCmsData = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('bsch_staff_token') || '';
      const res = await fetch('/api/staff/cms', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const resData = await res.json();
      if (!res.ok || !resData.success) {
        throw new Error(resData.error || 'تعذر تحميل بيانات إدارة الموقع');
      }

      setData(resData);
    } catch (err: any) {
      console.error('fetchCmsData error:', err);
      setError(err.message || 'حدث خطأ أثناء تحميل بيانات CMS');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCmsData();
  }, []);

  const subTabs = [
    { id: 'IDENTITY', label: 'الهوية والشعار', icon: Building2 },
    { id: 'HOMEPAGE', label: 'أقسام الرئيسية', icon: Layers },
    { id: 'NAVBAR', label: 'القائمة العلوية', icon: Menu },
    { id: 'FOOTER', label: 'التذييل والروابط', icon: FileText },
    { id: 'CLINICS', label: 'بطاقات العيادات', icon: Sliders },
    { id: 'SEO', label: 'محركات البحث', icon: Search },
    { id: 'MEDIA', label: 'مكتبة الوسائط', icon: ImageIcon },
    { id: 'ANNOUNCEMENTS', label: 'إدارة إعلانات وتنبيهات المستشفى', icon: BellRing },
    { id: 'NOTIFICATIONS', label: 'الإشعارات', icon: BellRing },
  ];

  if (loading) {
    return (
      <div className="bg-white rounded-3xl p-12 border border-[#E2E8EE] text-center space-y-3">
        <RefreshCw className="w-8 h-8 text-[#087F78] animate-spin mx-auto" />
        <h4 className="text-sm font-bold text-[#163C3A]">جاري تحميل بيانات نظام إدارة المحتوى (CMS)...</h4>
        <p className="text-xs text-[#8493A6]">يتم الاتصال بقاعدة البيانات واسترجاع إعدادات الموقع المنشورة</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-white rounded-3xl p-8 border border-red-200 text-center space-y-4">
        <AlertCircle className="w-10 h-10 text-red-500 mx-auto" />
        <h4 className="text-sm font-bold text-red-800">تعذر تحميل بيانات إدارة الموقع</h4>
        <p className="text-xs text-red-600">{error || 'حدث خطأ غير متوقع'}</p>
        <button
          onClick={fetchCmsData}
          className="inline-flex items-center gap-2 bg-[#087F78] text-white px-5 py-2.5 rounded-xl text-xs font-bold hover:bg-[#066560] transition-all"
        >
          <RefreshCw className="w-4 h-4" />
          <span>إعادة المحاولة</span>
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6" dir="rtl">
      {/* Top Header Card */}
      <div className="bg-white rounded-3xl p-6 border border-[#E2E8EE] shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-teal-50 border border-teal-100 flex items-center justify-center text-[#087F78] shrink-0">
            <Globe className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-[#163C3A]">نظام إدارة محتوى الموقع (Website CMS)</h2>
              <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                نشر فوري ومباشر
              </span>
            </div>
            <p className="text-xs text-[#8493A6] mt-0.5">
              تحكم ديناميكي كامل في كافة نصوص، روابط، صور، وبطاقات الموقع العام دون الحاجة لتعديل الكود المصدري.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchCmsData}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-[#163C3A] bg-slate-100 hover:bg-slate-200 border border-[#CBD5E1] transition-all"
            title="تحديث البيانات من السيرفر"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>تحديث</span>
          </button>

          <a
            href="/"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-[#087F78] hover:bg-[#066560] transition-all shadow-xs"
          >
            <span>معاينة الموقع المباشر</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>

      {/* Sub-Tabs Navigation */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-2 border-b border-[#E2E8EE]">
        {subTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeSubTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id as CmsSubTab)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold whitespace-nowrap transition-all ${
                isActive
                  ? 'bg-[#087F78] text-white shadow-xs'
                  : 'text-[#163C3A] hover:bg-white bg-slate-50 border border-transparent hover:border-[#E2E8EE]'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab Panels */}
      <div>
        {activeSubTab === 'IDENTITY' && (
          <IdentityEditor
            initialSettings={data.settings}
            onSaved={(newSettings) =>
              setData((prev) => (prev ? { ...prev, settings: newSettings } : prev))
            }
          />
        )}

        {activeSubTab === 'HOMEPAGE' && (
          <HomepageEditor
            initialSections={data.sections}
            onSaved={(newSections) =>
              setData((prev) => (prev ? { ...prev, sections: newSections } : prev))
            }
          />
        )}

        {activeSubTab === 'NAVBAR' && (
          <NavbarEditor
            initialNavigation={data.navigation}
            onSaved={(newNav) =>
              setData((prev) => (prev ? { ...prev, navigation: newNav } : prev))
            }
          />
        )}

        {activeSubTab === 'FOOTER' && (
          <FooterEditor
            initialSettings={data.settings}
            onSaved={(newSettings) =>
              setData((prev) => (prev ? { ...prev, settings: newSettings } : prev))
            }
          />
        )}

        {activeSubTab === 'CLINICS' && (
          <ClinicsPresentationEditor
            initialClinics={data.clinics}
            onSaved={(newClinics) =>
              setData((prev) => (prev ? { ...prev, clinics: newClinics } : prev))
            }
          />
        )}

        {activeSubTab === 'SEO' && (
          <SeoEditor
            initialSettings={data.settings}
            onSaved={(newSettings) =>
              setData((prev) => (prev ? { ...prev, settings: newSettings } : prev))
            }
          />
        )}

        {activeSubTab === 'MEDIA' && (
          <div className="bg-white border border-[#E2E8EE] rounded-3xl p-6 shadow-xs">
            <MediaManager isModal={false} />
          </div>
        )}

        {activeSubTab === 'ANNOUNCEMENTS' && (
          <AnnouncementManager
            initialSettings={data.settings}
            onSaved={(newSettings) => setData((prev) => (prev ? { ...prev, settings: newSettings } : prev))}
          />
        )}

        {activeSubTab === 'NOTIFICATIONS' && currentUser?.role === 'ADMIN' && (
          <PushNotificationEditor />
        )}
      </div>
    </div>
  );
}
