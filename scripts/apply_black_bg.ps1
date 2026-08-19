Add-Type -AssemblyName System.Drawing

$uploadDir = "C:\Users\danie\.gemini\antigravity-ide\brain\a617151f-3adc-4343-9f33-f4c8e72a73c4\.user_uploaded"
$outDir    = "C:\Users\danie\OneDrive\Documents\Antigravity Projetos\liga-da-pelada\public\images\cards"

# ============================================================
# PASSO 1: Copiar novas artes individuais recebidas
# Ordem de envio (do usuario): emergency_sub, extra_credit, golden_goal, double_prediction, scout
# O arquivo mais recente (media_1787097722453) parece ser um extra/duplicado - ignorar por ora
# ============================================================
$newCards = @(
    @{ file = "media_1787097671022.jpg"; slug = "emergency_sub"    },
    @{ file = "media_1787097674305.jpg"; slug = "extra_credit"     },
    @{ file = "media_1787097677434.jpg"; slug = "golden_goal"      },
    @{ file = "media_1787097680544.jpg"; slug = "double_prediction" },
    @{ file = "media_1787097683313.jpg"; slug = "scout"            }
)

foreach ($card in $newCards) {
    $src = Join-Path $uploadDir $card.file
    $dst = Join-Path $outDir "$($card.slug)_raw.jpg"
    Copy-Item $src $dst -Force
    Write-Host "Copiado: $($card.slug)"
}

# ============================================================
# PASSO 2: Aplicar fundo preto em TODAS as cartas do diretorio
# Adiciona padding de 3% em cada lado com fundo preto puro
# Isso elimina qualquer borda branca/transparente de recorte
# ============================================================
function Add-BlackBackground($inputPath, $outputPath) {
    $original = New-Object System.Drawing.Bitmap($inputPath)

    $padX = [int]($original.Width  * 0.03)
    $padY = [int]($original.Height * 0.03)
    $newW = $original.Width  + $padX * 2
    $newH = $original.Height + $padY * 2

    $canvas = New-Object System.Drawing.Bitmap($newW, $newH)
    $g = [System.Drawing.Graphics]::FromImage($canvas)

    # Preenche tudo com preto
    $g.Clear([System.Drawing.Color]::Black)

    # Configuracoes de qualidade maxima
    $g.InterpolationMode  = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode      = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode    = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality

    # Desenha a carta original centralizada
    $g.DrawImage($original, $padX, $padY, $original.Width, $original.Height)
    $g.Dispose()
    $original.Dispose()

    # Salva como PNG sem perda
    $canvas.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $canvas.Dispose()
}

# Processar todas as cartas (incluindo as novas _raw.jpg)
$allSlugs = @(
    "emergency_sub", "extra_credit", "golden_goal",
    "double_prediction", "scout",
    "duo", "safe_prediction", "golden_assist", "bargain", "all_in"
)

foreach ($slug in $allSlugs) {
    $rawPath = Join-Path $outDir "${slug}_raw.jpg"
    $pngPath = Join-Path $outDir "${slug}.png"

    if (Test-Path $rawPath) {
        # Nova arte individual recebida
        Add-BlackBackground $rawPath $pngPath
        Remove-Item $rawPath -Force
        Write-Host "OK (nova arte): $slug.png"
    } elseif (Test-Path $pngPath) {
        # Arte ja existente - aplicar fundo preto tambem
        $tmpPath = Join-Path $outDir "${slug}_tmp.png"
        Move-Item $pngPath $tmpPath -Force
        Add-BlackBackground $tmpPath $pngPath
        Remove-Item $tmpPath -Force
        Write-Host "OK (fundo preto): $slug.png"
    } else {
        Write-Host "AVISO: nao encontrado - $slug"
    }
}

Write-Host "`nPronto! Fundo preto aplicado em todas as cartas."
