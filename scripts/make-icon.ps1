Add-Type -AssemblyName System.Drawing
$taskRoot = Split-Path $PSScriptRoot -Parent
$taskOutput = Join-Path $taskRoot 'build'
New-Item -ItemType Directory -Force -Path $taskOutput | Out-Null
$taskSizes = @(16, 24, 32, 48, 64, 128, 256)
$taskImages = @()
foreach ($taskSize in $taskSizes) {
    $taskBitmap = [System.Drawing.Bitmap]::new($taskSize, $taskSize)
    $taskGraphics = [System.Drawing.Graphics]::FromImage($taskBitmap)
    $taskGraphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $taskGraphics.ScaleTransform($taskSize / 256.0, $taskSize / 256.0)
    $taskShape = [System.Drawing.Drawing2D.GraphicsPath]::new()
    $taskShape.AddArc(10, 10, 116, 116, 180, 90)
    $taskShape.AddArc(130, 10, 116, 116, 270, 90)
    $taskShape.AddArc(130, 130, 116, 116, 0, 90)
    $taskShape.AddArc(10, 130, 116, 116, 90, 90)
    $taskShape.CloseFigure()
    $taskBrush = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#3d526e'))
    $taskGraphics.FillPath($taskBrush, $taskShape)
    $taskPen = [System.Drawing.Pen]::new([System.Drawing.ColorTranslator]::FromHtml('#f0f5fc'), 13)
    $taskPen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
    $taskPoints = [System.Drawing.PointF[]]@([System.Drawing.PointF]::new(92, 85), [System.Drawing.PointF]::new(51, 128), [System.Drawing.PointF]::new(92, 172))
    $taskGraphics.DrawLines($taskPen, $taskPoints)
    $taskPoints = [System.Drawing.PointF[]]@([System.Drawing.PointF]::new(164, 85), [System.Drawing.PointF]::new(205, 128), [System.Drawing.PointF]::new(164, 172))
    $taskGraphics.DrawLines($taskPen, $taskPoints)
    $taskPen.Color = [System.Drawing.ColorTranslator]::FromHtml('#a6bfdc')
    $taskGraphics.DrawLine($taskPen, 143, 70, 113, 187)
    $taskStream = [System.IO.MemoryStream]::new()
    $taskBitmap.Save($taskStream, [System.Drawing.Imaging.ImageFormat]::Png)
    $taskImages += ,$taskStream.ToArray()
    if ($taskSize -eq 256) { $taskBitmap.Save((Join-Path $taskOutput 'icon.png'), [System.Drawing.Imaging.ImageFormat]::Png) }
    $taskStream.Dispose(); $taskGraphics.Dispose(); $taskBitmap.Dispose(); $taskShape.Dispose(); $taskBrush.Dispose(); $taskPen.Dispose()
}
$taskIcon = [System.IO.BinaryWriter]::new([System.IO.File]::Create((Join-Path $taskOutput 'icon.ico')))
$taskIcon.Write([uint16]0); $taskIcon.Write([uint16]1); $taskIcon.Write([uint16]$taskSizes.Length)
$taskOffset = 6 + 16 * $taskSizes.Length
for ($taskIndex = 0; $taskIndex -lt $taskSizes.Length; $taskIndex++) {
    $taskDimension = if ($taskSizes[$taskIndex] -eq 256) { 0 } else { $taskSizes[$taskIndex] }
    $taskIcon.Write([byte]$taskDimension); $taskIcon.Write([byte]$taskDimension)
    $taskIcon.Write([uint16]0); $taskIcon.Write([uint16]1); $taskIcon.Write([uint16]32)
    $taskIcon.Write([uint32]$taskImages[$taskIndex].Length); $taskIcon.Write([uint32]$taskOffset)
    $taskOffset += $taskImages[$taskIndex].Length
}
foreach ($taskImage in $taskImages) { $taskIcon.Write([byte[]]$taskImage) }
$taskIcon.Dispose()
