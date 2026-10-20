# server.ps1 - server kecil untuk mencoba situs di komputer sendiri.
# Memakai PowerShell bawaan Windows, jadi tidak perlu memasang Python atau apa pun.

$akar = $PSScriptRoot
$port = 8787
$alamat = "http://localhost:$port/"

$jenis = @{
  '.html' = 'text/html; charset=utf-8'
  '.js'   = 'text/javascript; charset=utf-8'
  '.css'  = 'text/css; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'
  '.svg'  = 'image/svg+xml'
  '.ico'  = 'image/x-icon'
  '.png'  = 'image/png'
  '.md'   = 'text/plain; charset=utf-8'
  '.xlsx' = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
}

$pendengar = New-Object System.Net.HttpListener
$pendengar.Prefixes.Add($alamat)
try {
  $pendengar.Start()
} catch {
  Write-Host ""
  Write-Host "  Tidak bisa memakai port $port - mungkin sedang dipakai program lain."
  Write-Host "  Pesan Windows: $($_.Exception.Message)"
  Write-Host ""
  Read-Host "  Tekan Enter untuk menutup"
  exit 1
}

Write-Host ""
Write-Host "  Situs berjalan di $alamat"
Write-Host "  Biarkan jendela ini terbuka selama masih dipakai."
Write-Host "  Tutup jendela ini kalau sudah selesai."
Write-Host ""
Start-Process $alamat

$akarPenuh = [System.IO.Path]::GetFullPath($akar)

while ($pendengar.IsListening) {
  try { $ctx = $pendengar.GetContext() } catch { break }
  $jawaban = $ctx.Response
  try {
    $jalur = [System.Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath)
    if ($jalur -eq '/') { $jalur = '/index.html' }
    $relatif = $jalur.TrimStart('/') -replace '/', '\'
    $penuh = [System.IO.Path]::GetFullPath((Join-Path $akar $relatif))

    if (-not $penuh.StartsWith($akarPenuh, [System.StringComparison]::OrdinalIgnoreCase)) {
      $jawaban.StatusCode = 403
    } elseif (Test-Path -LiteralPath $penuh -PathType Leaf) {
      $isi = [System.IO.File]::ReadAllBytes($penuh)
      $ext = [System.IO.Path]::GetExtension($penuh).ToLower()
      if ($jenis.ContainsKey($ext)) { $jawaban.ContentType = $jenis[$ext] }
      else { $jawaban.ContentType = 'application/octet-stream' }
      $jawaban.Headers.Add('Cache-Control', 'no-store')
      $jawaban.ContentLength64 = $isi.Length
      $jawaban.OutputStream.Write($isi, 0, $isi.Length)
    } else {
      $jawaban.StatusCode = 404
    }
    Write-Host ("  {0}  {1}" -f $jawaban.StatusCode, $jalur)
  } catch {
    try { $jawaban.StatusCode = 500 } catch { }
  } finally {
    try { $jawaban.OutputStream.Close() } catch { }
  }
}
