"use client";
import React, { useState } from 'react';
import { BookingWidget } from '../../components/BookingWidget';

export default function UberLandingSchema() {
  const [activeTab, setActiveTab] = useState('ride');

  return (
    <div className="min-h-screen bg-white text-black font-sans">
      {/* --- NAVIGATION BAR --- */}
      <nav className="bg-black text-white px-6 md:px-20 py-4 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-8">
          <div className="text-2xl font-semibold tracking-tighter">TaxiChat</div>
          <div className="hidden md:flex gap-6 text-sm font-medium">
            <a href="#" className="hover:opacity-70 transition">Viajar</a>
            <a href="#" className="hover:opacity-70 transition">Conducir</a>
            <a href="#" className="hover:opacity-70 transition">Empresas</a>
            <a href="#" className="hover:opacity-70 transition">Acerca de</a>
          </div>
        </div>
        <div className="flex items-center gap-4 text-sm font-medium">
          <button className="px-4 py-2 hover:bg-gray-800 rounded-full transition">ES</button>
          <button className="hidden sm:block px-4 py-2 hover:bg-gray-800 rounded-full transition">Iniciar sesión</button>
          <button className="bg-white text-black px-4 py-2 rounded-full hover:bg-gray-200 transition">Registrate</button>
        </div>
      </nav>

      {/* --- HERO SECTION --- */}
      <section className="relative bg-gray-100 min-h-[600px] flex items-center overflow-hidden">
        {/* Background Image (Uber Style) */}
        <div 
          className="absolute inset-0 z-0 bg-cover bg-center hidden md:block" 
          style={{ backgroundImage: "url('https://images.unsplash.com/photo-1559131397-f94da358f7ca?auto=format&fit=crop&q=80&w=2000')" }}
        >
          <div className="absolute inset-0 bg-black/10"></div>
        </div>

        <div className="container mx-auto px-6 md:px-20 z-10">
          <div className="bg-white w-full max-w-[550px] shadow-2xl">
            {/* Tabbed Interface */}
            <div className="flex border-b border-gray-100">
              <button 
                onClick={() => setActiveTab('ride')}
                className={`flex-1 py-6 flex flex-col items-center gap-2 transition ${activeTab === 'ride' ? 'border-b-4 border-black' : 'opacity-50'}`}
              >
                <span className="text-xl">🚗</span>
                <span className="text-sm font-bold">Viajar</span>
              </button>
              <button 
                onClick={() => setActiveTab('drive')}
                className={`flex-1 py-6 flex flex-col items-center gap-2 transition ${activeTab === 'drive' ? 'border-b-4 border-black' : 'opacity-50'}`}
              >
                <span className="text-xl">📈</span>
                <span className="text-sm font-bold">Conducir</span>
              </button>
              <button 
                onClick={() => setActiveTab('rent')}
                className={`flex-1 py-6 flex flex-col items-center gap-2 transition ${activeTab === 'rent' ? 'border-b-4 border-black' : 'opacity-50'}`}
              >
                <span className="text-xl">🔑</span>
                <span className="text-sm font-bold">Alquilar</span>
              </button>
            </div>

            {/* Content Area */}
            <div className="p-8">
              {activeTab === 'ride' ? (
                <div>
                  <h1 className="text-4xl font-bold mb-6 leading-tight">Pedí un viaje ahora</h1>
                  {/* Integración de tu Widget */}
                  <div className="-mx-6">
                    <BookingWidget mode="pro" />
                  </div>
                </div>
              ) : (
                <div className="py-10 text-center">
                  <h2 className="text-3xl font-bold mb-4">Hacé dinero conduciendo</h2>
                  <p className="text-gray-600 mb-8">Aprovechá tu tiempo al máximo y generá ganancias en Mendoza.</p>
                  <button className="bg-black text-white px-8 py-4 rounded-lg font-bold text-lg hover:bg-gray-800 transition">
                    Registrate para conducir
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* --- FEATURES SECTION --- */}
      <section className="py-20 px-6 md:px-20">
        <h2 className="text-4xl font-bold mb-12">Hacé más con TaxiChat</h2>
        <div className="grid md:grid-cols-2 gap-12">
          <div className="group cursor-pointer">
            <div className="overflow-hidden rounded-xl mb-4">
              <img 
                src="https://images.unsplash.com/photo-1449965408869-eaa3f722e40d?auto=format&fit=crop&q=80&w=800" 
                alt="Ride" 
                className="group-hover:scale-105 transition duration-500"
              />
            </div>
            <h3 className="text-2xl font-bold mb-2">Tu seguridad es lo primero</h3>
            <p className="text-gray-600 mb-4">Contamos con protocolos de seguridad y soporte 24/7 para todos los viajes en Mendoza.</p>
            <a href="#" className="font-medium border-b border-black pb-1 hover:text-gray-500 hover:border-gray-500 transition">Más información</a>
          </div>
          <div className="group cursor-pointer">
            <div className="overflow-hidden rounded-xl mb-4">
              <img 
                src="https://images.unsplash.com/photo-1521791136064-7986c2959210?auto=format&fit=crop&q=80&w=800" 
                alt="Business" 
                className="group-hover:scale-105 transition duration-500"
              />
            </div>
            <h3 className="text-2xl font-bold mb-2">TaxiChat para empresas</h3>
            <p className="text-gray-600 mb-4">Gestioná los traslados de tu equipo con un panel de control centralizado y reportes mensuales.</p>
            <a href="#" className="font-medium border-b border-black pb-1 hover:text-gray-500 hover:border-gray-500 transition">Ver soluciones corporativas</a>
          </div>
        </div>
      </section>

      {/* --- APP DOWNLOAD SECTION --- */}
      <section className="bg-gray-100 py-16 px-6 md:px-20">
        <div className="max-w-4xl mx-auto flex flex-col md:flex-row items-center justify-between gap-8">
          <h2 className="text-3xl font-bold">Descargá la app para pedir más rápido</h2>
          <div className="flex gap-4">
            <div className="bg-white p-4 rounded-xl shadow-sm flex items-center gap-4 cursor-pointer hover:shadow-md transition">
              <div className="w-12 h-12 bg-black rounded flex items-center justify-center text-white text-2xl">📱</div>
              <div>
                <p className="text-xs font-bold uppercase">App Store</p>
                <p className="text-sm">iOS</p>
              </div>
            </div>
            <div className="bg-white p-4 rounded-xl shadow-sm flex items-center gap-4 cursor-pointer hover:shadow-md transition">
              <div className="w-12 h-12 bg-black rounded flex items-center justify-center text-white text-2xl">🤖</div>
              <div>
                <p className="text-xs font-bold uppercase">Google Play</p>
                <p className="text-sm">Android</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* --- FOOTER --- */}
      <footer className="bg-black text-white py-20 px-6 md:px-20">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-12 mb-16">
          <div className="space-y-4">
            <h4 className="font-bold">Compañía</h4>
            <nav className="flex flex-col gap-2 text-sm text-gray-400">
              <a href="#" className="hover:text-white transition">Acerca de</a>
              <a href="#" className="hover:text-white transition">Ofertas</a>
              <a href="#" className="hover:text-white transition">Blog</a>
            </nav>
          </div>
          {/* ... Repetir para otras columnas ... */}
        </div>
        <div className="pt-8 border-t border-gray-800 text-xs text-gray-500 flex flex-col md:flex-row justify-between gap-4">
          <p>© 2024 TaxiChat Mendoza. Todos los derechos reservados.</p>
          <div className="flex gap-6">
            <a href="#" className="hover:text-white transition">Privacidad</a>
            <a href="#" className="hover:text-white transition">Accesibilidad</a>
            <a href="#" className="hover:text-white transition">Términos</a>
          </div>
        </div>
      </footer>
    </div>
  );
}