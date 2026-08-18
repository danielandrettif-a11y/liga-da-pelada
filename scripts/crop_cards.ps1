Add-Type -AssemblyName System.Drawing

$srcPath = "C:\Users\danie\.gemini\antigravity-ide\brain\a617151f-3adc-4343-9f33-f4c8e72a73c4\.user_uploaded\media_1787096886733.jpg"
$outDir  = "C:\Users\danie\OneDrive\Documents\Antigravity Projetos\liga-da-pelada\public\images\cards"

if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir -Force | Out-Null }

$src = New-Object System.Drawing.Bitmap($srcPath)
Write-Host "Imagem fonte: $($src.Width) x $($src.Height)"

$W = $src.Width
$H = $src.Height

# Fator de upscale — cada carta sera salva 3x maior que o recorte original
$scale = 3

function Crop-AndUpscale($name, $xRel, $yRel, $wRel, $hRel) {
    $x = [int]($W * $xRel)
    $y = [int]($H * $yRel)
    $w = [int]($W * $wRel)
    $h = [int]($H * $hRel)

    # Recorte na resolucao original
    $rect    = New-Object System.Drawing.Rectangle($x, $y, $w, $h)
    $cropped = $src.Clone($rect, $src.PixelFormat)

    # Upscale com interpolacao Bicubica (melhor qualidade)
    $dstW   = $w * $scale
    $dstH   = $h * $scale
    $scaled = New-Object System.Drawing.Bitmap($dstW, $dstH)
    $g      = [System.Drawing.Graphics]::FromImage($scaled)
    $g.InterpolationMode  = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode      = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode    = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $g.DrawImage($cropped, 0, 0, $dstW, $dstH)
    $g.Dispose()
    $cropped.Dispose()

    # Salvar como PNG (sem perda)
    $outFile = Join-Path $outDir "$name.png"
    $scaled.Save($outFile, [System.Drawing.Imaging.ImageFormat]::Png)
    $scaled.Dispose()

    Write-Host "OK: $name.png  =>  ${dstW} x ${dstH} px"
}

# ============================================================
# FILEIRA SUPERIOR  (y: 0.02 a 0.50)
# ============================================================
# 1. Caca-Talentos (scout)
Crop-AndUpscale "scout"               0.008  0.02   0.140  0.47

# 2. All-In (all_in)
Crop-AndUpscale "all_in"              0.165  0.02   0.155  0.47

# 3. Super Capitao (super_captain) — carta maior, centralizada
Crop-AndUpscale "super_captain"       0.375  0.01   0.250  0.56

# 4. Palpite Duplo (double_prediction)
Crop-AndUpscale "double_prediction"   0.640  0.02   0.155  0.47

# 5. Reserva de Emergencia (emergency_sub)
Crop-AndUpscale "emergency_sub"       0.805  0.02   0.190  0.47

# ============================================================
# FILEIRA INFERIOR  (y: 0.52 a 0.98)
# ============================================================
# 6. Dobradiinha (duo)
Crop-AndUpscale "duo"                 0.008  0.52   0.155  0.46

# 7. Palpite Seguro (safe_prediction)
Crop-AndUpscale "safe_prediction"     0.175  0.52   0.155  0.46

# 8. Credito Extra (extra_credit)
Crop-AndUpscale "extra_credit"        0.343  0.52   0.155  0.46

# 9. Barganha (bargain)
Crop-AndUpscale "bargain"             0.510  0.52   0.155  0.46

# 10. Gol de Ouro (golden_goal)
Crop-AndUpscale "golden_goal"         0.677  0.52   0.155  0.46

# 11. Passe de Ouro (golden_assist)
Crop-AndUpscale "golden_assist"       0.843  0.52   0.155  0.46

# vice_captain usa arte propria - copia do double_prediction como placeholder
Copy-Item (Join-Path $outDir 'double_prediction.png') (Join-Path $outDir 'vice_captain.png') -Force
Write-Host 'OK: vice_captain.png (placeholder - copiar arte propria quando disponivel)'

$src.Dispose()
Write-Host 'Todas as cartas recortadas e ampliadas com sucesso!'
