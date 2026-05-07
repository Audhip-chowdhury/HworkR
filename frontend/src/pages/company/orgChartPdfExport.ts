import { jsPDF } from 'jspdf'

const PRIMARY_RGB: [number, number, number] = [27, 79, 114]

/** Decode natural pixel size from a raster data URL for aspect ratio math. */
export function rasterSizeFromDataUrl(dataUrl: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () =>
      resolve({ w: Math.max(1, img.naturalWidth), h: Math.max(1, img.naturalHeight) })
    img.onerror = () => reject(new Error('Failed to decode chart image'))
    img.src = dataUrl
  })
}

/**
 * Single-page A4 portrait PDF: branded header strip, chart letterboxed to fit printable area,
 * subtle footer — suitable for printing.
 */
export function downloadOrgChartA4Pdf(opts: {
  companyName: string
  pngDataUrl: string
  imagePixelW: number
  imagePixelH: number
  fileStem: string
}): void {
  const { companyName, pngDataUrl, imagePixelW, imagePixelH, fileStem } = opts
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()

  const marginX = 12
  const marginBottom = 10
  const headerH = 24
  const gapBelowHeader = 5

  pdf.setFillColor(PRIMARY_RGB[0], PRIMARY_RGB[1], PRIMARY_RGB[2])
  pdf.rect(0, 0, pageW, headerH, 'F')

  pdf.setDrawColor(200, 210, 220)
  pdf.setLineWidth(0.2)
  pdf.line(0, headerH, pageW, headerH)

  pdf.setTextColor(255, 255, 255)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(15)
  const title = companyName.trim() || 'Company'
  pdf.text(title, marginX, 12, { maxWidth: pageW - marginX * 2 })

  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(9)
  pdf.setTextColor(220, 232, 242)
  pdf.text('Organization chart', marginX, 19)

  const contentTop = headerH + gapBelowHeader
  const contentW = pageW - 2 * marginX
  const contentH = pageH - contentTop - marginBottom - 6

  const imgAspect = imagePixelW / imagePixelH
  const boxAspect = contentW / contentH

  let drawW: number
  let drawH: number
  if (imgAspect > boxAspect) {
    drawW = contentW
    drawH = contentW / imgAspect
  } else {
    drawH = contentH
    drawW = contentH * imgAspect
  }

  const x = marginX + (contentW - drawW) / 2
  const y = contentTop + (contentH - drawH) / 2

  pdf.setDrawColor(233, 236, 239)
  pdf.setFillColor(248, 249, 250)
  pdf.roundedRect(x - 0.5, y - 0.5, drawW + 1, drawH + 1, 1.2, 1.2, 'FD')

  pdf.addImage(pngDataUrl, 'PNG', x, y, drawW, drawH)

  const generated = new Date().toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(7.5)
  pdf.setTextColor(127, 140, 141)
  pdf.text(`Prepared for printing · ${generated}`, marginX, pageH - 4.5)

  pdf.save(`${fileStem}-org-chart-a4.pdf`)
}
