"""Generate VoiceType app icon — microphone with sound waves on gradient background"""
import struct
import io
import zlib

# We'll create a 256x256 PNG icon programmatically
# Design: Rounded square with gradient background, white microphone silhouette

WIDTH = 256
HEIGHT = 256

def create_pixel_data():
    """Create the icon pixel data as RGBA"""
    pixels = []

    cx, cy = WIDTH // 2, HEIGHT // 2

    for y in range(HEIGHT):
        row = []
        for x in range(WIDTH):
            # Rounded rectangle mask (corner radius 48)
            radius = 48
            in_rect = True

            # Check corners
            if x < radius and y < radius:
                dist = ((x - radius) ** 2 + (y - radius) ** 2) ** 0.5
                in_rect = dist <= radius
            elif x >= WIDTH - radius and y < radius:
                dist = ((x - (WIDTH - radius - 1)) ** 2 + (y - radius) ** 2) ** 0.5
                in_rect = dist <= radius
            elif x < radius and y >= HEIGHT - radius:
                dist = ((x - radius) ** 2 + (y - (HEIGHT - radius - 1)) ** 2) ** 0.5
                in_rect = dist <= radius
            elif x >= WIDTH - radius and y >= HEIGHT - radius:
                dist = ((x - (WIDTH - radius - 1)) ** 2 + (y - (HEIGHT - radius - 1)) ** 2) ** 0.5
                in_rect = dist <= radius

            if not in_rect:
                row.append((0, 0, 0, 0))  # Transparent
                continue

            # Gradient background: deep purple-blue to vibrant pink-red
            t = y / HEIGHT
            r = int(30 + t * 60)    # 30 -> 90
            g = int(15 + t * 10)    # 15 -> 25
            b = int(80 + t * 40)    # 80 -> 120

            # Add some warmth in the center
            dx = (x - cx) / cx
            dy = (y - cy) / cy
            center_dist = (dx * dx + dy * dy) ** 0.5

            # Subtle radial gradient overlay
            if center_dist < 1.0:
                blend = max(0, 1.0 - center_dist) * 0.3
                r = int(r + blend * 80)
                g = int(g + blend * 20)
                b = int(b + blend * 60)

            # Clamp
            r = min(255, max(0, r))
            g = min(255, max(0, g))
            b = min(255, max(0, b))

            # --- Draw microphone icon ---
            # Microphone body (rounded rectangle, centered)
            mic_cx = cx
            mic_top = 55
            mic_bottom = 145
            mic_width = 32
            mic_radius = 32  # Top cap radius

            is_mic = False

            # Mic body rectangle
            if mic_cx - mic_width <= x <= mic_cx + mic_width and mic_top + mic_radius <= y <= mic_bottom:
                is_mic = True

            # Mic top cap (semicircle)
            if not is_mic:
                dist = ((x - mic_cx) ** 2 + (y - (mic_top + mic_radius)) ** 2) ** 0.5
                if dist <= mic_radius and y <= mic_top + mic_radius:
                    is_mic = True

            # Mic bottom cap (semicircle)
            if not is_mic:
                dist = ((x - mic_cx) ** 2 + (y - mic_bottom) ** 2) ** 0.5
                if dist <= mic_width and y >= mic_bottom:
                    is_mic = True

            # Mic grille lines (3 horizontal lines on mic body)
            is_grille = False
            if is_mic:
                for line_y in [85, 105, 125]:
                    if abs(y - line_y) <= 1 and mic_cx - mic_width + 8 <= x <= mic_cx + mic_width - 8:
                        is_grille = True

            # Mic holder arc (U-shape around bottom of mic)
            arc_cx = cx
            arc_cy = 130
            arc_radius_outer = 55
            arc_radius_inner = 48
            arc_thickness = 4

            is_arc = False
            dist_from_arc = ((x - arc_cx) ** 2 + (y - arc_cy) ** 2) ** 0.5
            if arc_radius_inner <= dist_from_arc <= arc_radius_outer + arc_thickness and y >= arc_cy:
                if abs(dist_from_arc - (arc_radius_outer)) <= arc_thickness:
                    is_arc = True

            # Mic stand (vertical line down from arc)
            is_stand = False
            if abs(x - cx) <= 3 and 130 + 55 <= y <= 210:
                is_stand = True

            # Mic base (horizontal line at bottom)
            is_base = False
            if abs(y - 210) <= 3 and cx - 30 <= x <= cx + 30:
                is_base = True

            # Sound wave arcs (right side)
            is_wave = False
            for wave_r, wave_w in [(75, 3), (95, 3), (115, 3)]:
                dist = ((x - mic_cx) ** 2 + (y - 105) ** 2) ** 0.5
                if abs(dist - wave_r) <= wave_w and x > mic_cx + 40:
                    # Only show right-side arcs in a ~60 degree cone
                    angle_from_right = abs(y - 105) / max(1, abs(x - mic_cx))
                    if angle_from_right < 0.8:
                        is_wave = True

            # Left side waves (mirror)
            for wave_r, wave_w in [(75, 3), (95, 3), (115, 3)]:
                dist = ((x - mic_cx) ** 2 + (y - 105) ** 2) ** 0.5
                if abs(dist - wave_r) <= wave_w and x < mic_cx - 40:
                    angle_from_left = abs(y - 105) / max(1, abs(mic_cx - x))
                    if angle_from_left < 0.8:
                        is_wave = True

            # Apply colors
            if is_mic and not is_grille:
                # White microphone
                r, g, b = 255, 255, 255
            elif is_grille:
                # Slightly transparent grille lines
                r, g, b = int(r * 0.7), int(g * 0.7), int(b * 0.7)
            elif is_arc or is_stand or is_base:
                # White stand/arc
                r, g, b = 230, 230, 240
            elif is_wave:
                # Semi-transparent white waves
                r = min(255, r + 140)
                g = min(255, g + 140)
                b = min(255, b + 150)

            row.append((r, g, b, 255))
        pixels.append(row)

    return pixels


def create_png(pixels, width, height):
    """Create a PNG file from pixel data"""
    def make_chunk(chunk_type, data):
        chunk = chunk_type + data
        crc = zlib.crc32(chunk) & 0xFFFFFFFF
        return struct.pack('>I', len(data)) + chunk + struct.pack('>I', crc)

    # PNG signature
    signature = b'\x89PNG\r\n\x1a\n'

    # IHDR
    ihdr_data = struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0)  # 8-bit RGBA
    ihdr = make_chunk(b'IHDR', ihdr_data)

    # IDAT - image data
    raw_data = b''
    for row in pixels:
        raw_data += b'\x00'  # Filter: None
        for r, g, b, a in row:
            raw_data += struct.pack('BBBB', r, g, b, a)

    compressed = zlib.compress(raw_data, 9)
    idat = make_chunk(b'IDAT', compressed)

    # IEND
    iend = make_chunk(b'IEND', b'')

    return signature + ihdr + idat + iend


def create_ico(png_data_256):
    """Create a minimal ICO file containing the 256x256 PNG"""
    # ICO header
    header = struct.pack('<HHH', 0, 1, 1)  # Reserved, Type=ICO, Count=1

    # Directory entry for 256x256 PNG
    # Width=0 means 256, Height=0 means 256
    png_size = len(png_data_256)
    offset = 6 + 16  # Header(6) + 1 dir entry(16)

    dir_entry = struct.pack('<BBBBHHII',
        0,      # Width (0 = 256)
        0,      # Height (0 = 256)
        0,      # Color palette
        0,      # Reserved
        1,      # Color planes
        32,     # Bits per pixel
        png_size,  # Size of image data
        offset     # Offset to image data
    )

    return header + dir_entry + png_data_256


if __name__ == '__main__':
    print("Generating VoiceType icon...")

    pixels = create_pixel_data()

    # Create 256x256 PNG
    png_data = create_png(pixels, WIDTH, HEIGHT)

    with open('icon.png', 'wb') as f:
        f.write(png_data)
    print(f"Created icon.png ({len(png_data)} bytes)")

    # Create ICO from PNG
    ico_data = create_ico(png_data)

    with open('icon.ico', 'wb') as f:
        f.write(ico_data)
    print(f"Created icon.ico ({len(ico_data)} bytes)")

    print("Done!")
