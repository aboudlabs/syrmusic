"""Generates SyrMusic icons (PIL only). Run: python3 tools/make-icons.py"""
from PIL import Image, ImageDraw
BG, ACC, N = (23, 19, 38), (118, 103, 248), 1024

def draw(scale):
    im = Image.new("RGB", (N, N), BG)
    d = ImageDraw.Draw(im)
    s, o = scale, (1 - scale) * N / 2
    p = lambda x, y: (o + x * s, o + y * s)
    d.ellipse([*p(255, 585), *p(525, 855)], fill=ACC)                      # note head
    d.rounded_rectangle([*p(470, 200), *p(545, 720)], radius=30 * s, fill=ACC)  # stem
    d.polygon([p(500, 200), p(790, 300), p(790, 450), p(500, 370)], fill=ACC)   # flag
    return im

def save(scale, size, name):
    draw(scale).resize((size, size), Image.LANCZOS).save(f"icons/{name}")

save(0.92, 512, "icon-512.png"); save(0.92, 192, "icon-192.png")
save(0.92, 180, "apple-touch-icon.png"); save(0.92, 32, "favicon-32.png")
save(0.62, 512, "icon-maskable-512.png")  # symbol inside the 80% safe zone
open("icons/icon.svg", "w").write('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><rect width="1024" height="1024" fill="#171326"/><g fill="#7667F8"><circle cx="390" cy="720" r="135"/><rect x="470" y="200" width="75" height="520" rx="30"/><path d="M500 200L790 300V450L500 370Z"/></g></svg>')
print("icons ok")
