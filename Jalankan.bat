@echo off
chcp 65001 >nul
title Data Kebun - Ujicoba di komputer
cd /d "%~dp0"

echo.
echo   Data Kebun - PT VIGU FARM INDONESIA
echo   Ujicoba di komputer sendiri (tanpa GitHub)
echo.

rem Halaman ini memuat file JavaScript sebagai modul, jadi TIDAK bisa dibuka
rem dengan klik dua kali index.html - harus lewat alamat http. Script ini
rem menyalakan server kecil bawaan Python di folder ini.

if not exist "data\payroll.json" if not exist "data\alat-berat.json" (
  echo   [!] Folder data masih kosong.
  echo.
  echo   Buka aplikasi desktop lebih dulu, masuk menu "Sinkron GitHub",
  echo   isi Password data, lalu klik "Ekspor ke File..." dan simpan ke:
  echo.
  echo       %cd%\data
  echo.
  echo   Nama berkasnya: payroll.json  ^(atau alat-berat.json^)
  echo.
  pause
  exit /b 1
)

set PY=
where py >nul 2>nul && set PY=py
if "%PY%"=="" where python >nul 2>nul && set PY=python
if "%PY%"=="" (
  echo   [!] Python belum terpasang, padahal aplikasi desktop memerlukannya juga.
  echo       Download di https://www.python.org/downloads/
  echo       Saat memasang, centang "Add python.exe to PATH".
  echo.
  start "" https://www.python.org/downloads/
  pause
  exit /b 1
)

echo   Membuka http://localhost:8787 di peramban...
echo   Biarkan jendela ini terbuka selama masih dipakai.
echo   Tekan Ctrl+C atau tutup jendela ini untuk berhenti.
echo.
start "" http://localhost:8787/
%PY% -m http.server 8787
pause
