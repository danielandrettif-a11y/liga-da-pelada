Add-Type -AssemblyName System.Drawing

function Add-BlackBg($inputPath, $outputPath) {
    $original = New-Object System.Drawing.Bitmap($inputPath)
    $padX = [int]($original.Width  * 0.03)
    $padY = [int]($original.Height * 0.03)
    $newW = $original.Width  + $padX * 2
    $newH = $original.Height + $padY * 2
    $canvas = New-Object System.Drawing.Bitmap($newW, $newH)
    $g = [System.Drawing.Graphics]::FromImage($canvas)
    $g.Clear([System.Drawing.Color]::Black)
    $g.InterpolationMode  = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode      = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode    = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $g.DrawImage($original, $padX, $padY, $original.Width, $original.Height)
    $g.Dispose()
    $original.Dispose()
    $canvas.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $canvas.Dispose()
    Write-Host "OK: $outputPath"
}

$uploadDir = "C:\Users\danie\.gemini\antigravity-ide\brain\a617151f-3adc-4343-9f33-f4c8e72a73c4\.user_uploaded"
$outDir    = "C:\Users\danie\OneDrive\Documents\Antigravity Projetos\liga-da-pelada\public\images\cards"

# Super Capitao (unico que faltava)
Add-BlackBg (Join-Path $uploadDir "media_1787097722453.jpg") (Join-Path $outDir "super_captain.png")

Write-Host "Concluido!"
