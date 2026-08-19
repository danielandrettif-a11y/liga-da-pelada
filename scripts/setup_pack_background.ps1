Add-Type -AssemblyName System.Drawing

# 1. Copiar o fundo de estádio cinematográfico para public/images/pack-stadium-bg.jpg
$stadiumSrc = "C:\Users\danie\.gemini\antigravity-ide\brain\a617151f-3adc-4343-9f33-f4c8e72a73c4\stadium_pack_bg_1787099902668.jpg"
$stadiumDst = "C:\Users\danie\OneDrive\Documents\Antigravity Projetos\liga-da-pelada\public\images\pack-stadium-bg.jpg"
Copy-Item $stadiumSrc $stadiumDst -Force
Write-Host "Fundo de estádio salvo em $stadiumDst"

# 2. Processar o pacote oficial para deixá-lo com fundo transparente ou com recorte suave
$packSrcPath = "C:\Users\danie\.gemini\antigravity-ide\brain\a617151f-3adc-4343-9f33-f4c8e72a73c4\.user_uploaded\media_1787094375822.png"
$packDstPath = "C:\Users\danie\OneDrive\Documents\Antigravity Projetos\liga-da-pelada\public\images\pack-cover.png"

$packBmp = New-Object System.Drawing.Bitmap($packSrcPath)
$w = $packBmp.Width
$h = $packBmp.Height

# Recortar o pacote aproximado (removendo margens cinzas extras)
# O pacote ocupa de x: 10% a 90%, y: 5% a 95%
$cropX = [int]($w * 0.08)
$cropY = [int]($h * 0.04)
$cropW = [int]($w * 0.84)
$cropH = [int]($h * 0.92)

$rect = New-Object System.Drawing.Rectangle($cropX, $cropY, $cropW, $cropH)
$cropped = $packBmp.Clone($rect, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)

# Criar bitmap final 3x maior com suavização para alta resolução
$scale = 3
$finalW = $cropW * $scale
$finalH = $cropH * $scale
$finalBmp = New-Object System.Drawing.Bitmap($finalW, $finalH, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($finalBmp)
$g.InterpolationMode  = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.SmoothingMode      = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$g.PixelOffsetMode    = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality

$g.DrawImage($cropped, 0, 0, $finalW, $finalH)
$g.Dispose()
$cropped.Dispose()
$packBmp.Dispose()

$finalBmp.Save($packDstPath, [System.Drawing.Imaging.ImageFormat]::Png)
$finalBmp.Dispose()

Write-Host "Pacote BQ salvo em alta resolução em $packDstPath"
