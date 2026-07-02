"use client";

import { useAuth } from "@/contexts/AuthContext";
import { ArrowLeft, Bell, BellOff, Smartphone } from "lucide-react";
import Link from "next/link";
import { useState, useEffect } from "react";
import { db } from "@/lib/firebase/config";
import { doc, getDoc, setDoc } from "firebase/firestore";
// import { getToken } from "firebase/messaging";
// import { messaging } from "@/lib/firebase/config"; // Requires FCM setup

export default function SettingsPage() {
  const { user, loading } = useAuth();
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState<string>("default");

  useEffect(() => {
    if (user && typeof window !== "undefined") {
      setPermissionStatus(Notification.permission);
      // Check if user has a token saved
      const checkStatus = async () => {
        const docRef = doc(db, "users", user.uid);
        const snapshot = await getDoc(docRef);
        if (snapshot.exists() && snapshot.data().fcmToken) {
          setNotificationsEnabled(true);
        }
      };
      checkStatus();
    }
  }, [user]);

  const handleEnableNotifications = async () => {
    if (!("Notification" in window)) {
      alert("Este navegador não suporta notificações.");
      return;
    }
    
    const permission = await Notification.requestPermission();
    setPermissionStatus(permission);
    
    if (permission === "granted") {
      // Setup Firebase Cloud Messaging here
      // For this phase, we mock the UI state
      setNotificationsEnabled(true);
      if (user) {
        await setDoc(doc(db, "users", user.uid), { fcmToken: "mock-token-" + Date.now() }, { merge: true });
      }
      alert("Notificações ativadas com sucesso!");
    }
  };

  const handleDisableNotifications = async () => {
    setNotificationsEnabled(false);
    if (user) {
      await setDoc(doc(db, "users", user.uid), { fcmToken: null }, { merge: true });
    }
    alert("Notificações desativadas.");
  };

  if (loading) return null;

  if (!user) {
    return <div className="p-8 text-center">Você precisa estar logado.</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="bg-white px-6 pt-12 pb-6 shadow-sm sticky top-0 z-10 flex items-center gap-4">
        <Link href="/" className="p-2 -ml-2 text-gray-400 hover:text-rose-500 transition-colors">
          <ArrowLeft className="w-6 h-6" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Configurações</h1>
          <p className="text-sm text-gray-500">Notificações e Alertas</p>
        </div>
      </div>

      <div className="p-4 space-y-4 max-w-2xl mx-auto mt-4">
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center gap-4 mb-6">
            <div className="bg-rose-50 w-12 h-12 rounded-full flex items-center justify-center">
              <Smartphone className="text-rose-500 w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-800">Alertas no Celular</h2>
              <p className="text-sm text-gray-500">Receba resumos semanais de pacientes</p>
            </div>
          </div>
          
          <div className="space-y-4">
            <div className="flex justify-between items-center bg-gray-50 p-4 rounded-xl border border-gray-100">
              <div>
                <div className="font-medium text-gray-800">Status atual:</div>
                <div className="text-sm text-gray-500">
                  {permissionStatus === "denied" 
                    ? "Bloqueado pelo navegador"
                    : notificationsEnabled ? "Ativado" : "Desativado"}
                </div>
              </div>
              
              {notificationsEnabled ? (
                <button 
                  onClick={handleDisableNotifications}
                  className="flex items-center gap-2 bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-2 rounded-lg transition-colors font-medium text-sm"
                >
                  <BellOff className="w-4 h-4" /> Desativar
                </button>
              ) : (
                <button 
                  onClick={handleEnableNotifications}
                  disabled={permissionStatus === "denied"}
                  className="flex items-center gap-2 bg-rose-500 hover:bg-rose-600 disabled:bg-gray-300 text-white px-4 py-2 rounded-lg transition-colors font-medium text-sm"
                >
                  <Bell className="w-4 h-4" /> Ativar Alertas
                </button>
              )}
            </div>
            
            {permissionStatus === "denied" && (
              <p className="text-sm text-amber-600 bg-amber-50 p-3 rounded-lg border border-amber-100">
                Você bloqueou as notificações neste navegador. Para ativar, você precisa mudar as configurações do seu navegador (ícone de cadeado na barra de endereços).
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
