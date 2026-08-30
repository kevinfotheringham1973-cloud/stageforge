# Regenerates build/appx/*.png (the MSIX Store tile images) from
# build/icon.png. See electron-builder.yml's appx.backgroundColor
# comment for why these exist at all -- electron-builder does NOT
# auto-generate appx tile images the way it does the NSIS .ico, and
# silently falls back to its own blank placeholder images if
# build/appx/ doesn't exist. Re-run this whenever build/icon.png
# changes.
Add-Type -AssemblyName System.Drawing

$srcPath = Join-Path $PSScriptRoot "..\build\icon.png"
$outDir = Join-Path $PSScriptRoot "..\build\appx"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$src = [System.Drawing.Image]::FromFile($srcPath)

function New-TileImage($canvasW, $canvasH, $iconFraction, $outPath) {
    $bmp = New-Object System.Drawing.Bitmap($canvasW, $canvasH, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceOver
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)

    # Source icon is square (1024x1024) -- fit it within iconFraction of
    # the SHORTER canvas dimension, centered both ways. Leaves the safe-
    # zone padding Microsoft's tile guidance recommends instead of a
    # full-bleed icon; electron-builder.yml's appx.backgroundColor fills
    # the transparent margin this leaves.
    $shortSide = [Math]::Min($canvasW, $canvasH)
    $iconSize = [int]($shortSide * $iconFraction)
    $x = [int](($canvasW - $iconSize) / 2)
    $y = [int](($canvasH - $iconSize) / 2)
    $g.DrawImage($src, $x, $y, $iconSize, $iconSize)

    $g.Dispose()
    $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Output "Wrote $outPath ($canvasW x $canvasH, icon $iconSize px)"
}

New-TileImage 50 50 0.66 (Join-Path $outDir "StoreLogo.png")
New-TileImage 44 44 0.66 (Join-Path $outDir "Square44x44Logo.png")
New-TileImage 150 150 0.66 (Join-Path $outDir "Square150x150Logo.png")
New-TileImage 310 150 0.66 (Join-Path $outDir "Wide310x150Logo.png")

$src.Dispose()
Write-Output "Done."
