Add-Type -AssemblyName System.Drawing

$srcPath = "C:\Users\danie\.gemini\antigravity-ide\brain\a617151f-3adc-4343-9f33-f4c8e72a73c4\.user_uploaded\media_1787095595538.jpg"
$outDir = "C:\Users\danie\OneDrive\Documents\Antigravity Projetos\liga-da-pelada\public\images\cards"

if (-not (Test-Path $outDir)) {
    New-Item -ItemType Directory -Path $outDir -Force | Out-Null
}

$bmp = New-Object System.Drawing.Bitmap($srcPath)
Write-Host "Source image: $($bmp.Width) x $($bmp.Height)"

# Função para cortar e salvar
function Crop-Card($name, $x, $y, $w, $h) {
    $rect = New-Object System.Drawing.Rectangle($x, $y, $w, $h)
    $cropped = $bmp.Clone($rect, $bmp.PixelFormat)
    $targetFile = Join-Path $outDir "$name.png"
    $cropped.Save($targetFile, [System.Drawing.Imaging.ImageFormat]::Png)
    $cropped.Dispose()
    Write-Host "Saved: $targetFile ($w x $h)"
}

# Coordenadas relativas aproximadas baseadas na proporção da imagem:
# Imagem total: 1040 x 585 (ou proporcional)
$wTotal = $bmp.Width
$hTotal = $bmp.Height

# Medições das cartas na imagem:
# Fileira Superior:
# 1. Caça-Talentos (scout): x: 0.026, y: 0.075, w: 0.128, h: 0.380
# 2. All-In (all_in): x: 0.177, y: 0.075, w: 0.130, h: 0.380
# 3. Super Capitão (super_captain): x: 0.407, y: 0.075, w: 0.186, h: 0.490
# 4. Palpite Duplo (double_prediction): x: 0.693, y: 0.075, w: 0.130, h: 0.380
# 5. Reserva de Emergência (emergency_sub): x: 0.843, y: 0.075, w: 0.130, h: 0.380

# Fileira Inferior:
# 6. Dobradinha (duo): x: 0.028, y: 0.620, w: 0.128, h: 0.360
# 7. Palpite Seguro (safe_prediction): x: 0.185, y: 0.620, w: 0.128, h: 0.360
# 8. Crédito Extra (extra_credit): x: 0.355, y: 0.620, w: 0.128, h: 0.360
# 9. Barganha (bargain): x: 0.520, y: 0.620, w: 0.128, h: 0.360
# 10. Gol de Ouro (golden_goal): x: 0.686, y: 0.620, w: 0.128, h: 0.360
# 11. Passe de Ouro (golden_assist): x: 0.844, y: 0.620, w: 0.128, h: 0.360

Crop-Card "scout" ([int]($wTotal * 0.026)) ([int]($hTotal * 0.075)) ([int]($wTotal * 0.130)) ([int]($hTotal * 0.380))
Crop-Card "all_in" ([int]($wTotal * 0.177)) ([int]($hTotal * 0.075)) ([int]($wTotal * 0.130)) ([int]($hTotal * 0.380))
Crop-Card "super_captain" ([int]($wTotal * 0.407)) ([int]($hTotal * 0.075)) ([int]($wTotal * 0.186)) ([int]($hTotal * 0.490))
Crop-Card "double_prediction" ([int]($wTotal * 0.693)) ([int]($hTotal * 0.075)) ([int]($wTotal * 0.130)) ([int]($hTotal * 0.380))
Crop-Card "emergency_sub" ([int]($wTotal * 0.843)) ([int]($hTotal * 0.075)) ([int]($wTotal * 0.130)) ([int]($hTotal * 0.380))

Crop-Card "duo" ([int]($wTotal * 0.028)) ([int]($hTotal * 0.620)) ([int]($wTotal * 0.128)) ([int]($hTotal * 0.360))
Crop-Card "safe_prediction" ([int]($wTotal * 0.185)) ([int]($hTotal * 0.620)) ([int]($wTotal * 0.128)) ([int]($hTotal * 0.360))
Crop-Card "extra_credit" ([int]($wTotal * 0.355)) ([int]($hTotal * 0.620)) ([int]($wTotal * 0.128)) ([int]($hTotal * 0.360))
Crop-Card "bargain" ([int]($wTotal * 0.520)) ([int]($hTotal * 0.620)) ([int]($wTotal * 0.128)) ([int]($hTotal * 0.360))
Crop-Card "golden_goal" ([int]($wTotal * 0.686)) ([int]($hTotal * 0.620)) ([int]($wTotal * 0.128)) ([int]($hTotal * 0.360))
Crop-Card "golden_assist" ([int]($wTotal * 0.844)) ([int]($hTotal * 0.620)) ([int]($wTotal * 0.128)) ([int]($hTotal * 0.360))

# Para o vice_captain, usamos a base da carta de dupla/rara ou geramos uma específica
# Criamos uma cópia elegante
Copy-Item (Join-Path $outDir "duo.png") (Join-Path $outDir "vice_captain.png") -Force

$bmp.Dispose()
Write-Host "All cards cropped successfully!"
