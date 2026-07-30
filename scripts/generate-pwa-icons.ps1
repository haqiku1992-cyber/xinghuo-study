Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$output = Join-Path $root "public"
New-Item -ItemType Directory -Force -Path $output | Out-Null

function New-AppIcon([int]$size, [string]$path, [bool]$maskable) {
  $bitmap = [System.Drawing.Bitmap]::new($size, $size)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  $lightColor = [System.Drawing.ColorTranslator]::FromHtml("#F8F8F6")
  $darkColor = [System.Drawing.ColorTranslator]::FromHtml("#252321")
  $accentColor = [System.Drawing.ColorTranslator]::FromHtml("#E56F35")
  $graphics.Clear($lightColor)

  $margin = if ($maskable) { [int]($size * 0.18) } else { [int]($size * 0.08) }
  $rect = [System.Drawing.RectangleF]::new($margin, $margin, $size - 2 * $margin, $size - 2 * $margin)
  $radius = [single]($size * 0.19)
  $pathShape = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $pathShape.AddArc($rect.X, $rect.Y, $radius, $radius, 180, 90)
  $pathShape.AddArc($rect.Right - $radius, $rect.Y, $radius, $radius, 270, 90)
  $pathShape.AddArc($rect.Right - $radius, $rect.Bottom - $radius, $radius, $radius, 0, 90)
  $pathShape.AddArc($rect.X, $rect.Bottom - $radius, $radius, $radius, 90, 90)
  $pathShape.CloseFigure()
  $darkBrush = [System.Drawing.SolidBrush]::new($darkColor)
  $graphics.FillPath($darkBrush, $pathShape)

  $fontRatio = if ($maskable) { 0.34 } else { 0.42 }
  $fontSize = [single]($size * $fontRatio)
  $font = [System.Drawing.Font]::new("Microsoft YaHei", $fontSize, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $format = [System.Drawing.StringFormat]::new()
  $format.Alignment = [System.Drawing.StringAlignment]::Center
  $format.LineAlignment = [System.Drawing.StringAlignment]::Center
  $textRect = [System.Drawing.RectangleF]::new(0, [single](-$size * 0.015), $size, $size)
  $lightBrush = [System.Drawing.SolidBrush]::new($lightColor)
  $mark = [string][char]0x661F
  $graphics.DrawString($mark, $font, $lightBrush, $textRect, $format)

  $dotSize = [single]($size * 0.10)
  $dotX = [single]($size * 0.70)
  $dotY = [single]($size * 0.24)
  $accentBrush = [System.Drawing.SolidBrush]::new($accentColor)
  $graphics.FillEllipse($accentBrush, $dotX, $dotY, $dotSize, $dotSize)

  $bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $format.Dispose()
  $font.Dispose()
  $darkBrush.Dispose()
  $lightBrush.Dispose()
  $accentBrush.Dispose()
  $pathShape.Dispose()
  $graphics.Dispose()
  $bitmap.Dispose()
}

New-AppIcon 32 (Join-Path $output "icon-32.png") $false
New-AppIcon 180 (Join-Path $output "apple-touch-icon.png") $false
New-AppIcon 192 (Join-Path $output "icon-192.png") $false
New-AppIcon 512 (Join-Path $output "icon-512.png") $false
New-AppIcon 512 (Join-Path $output "icon-maskable-512.png") $true
