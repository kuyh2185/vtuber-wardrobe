# 재질을 MToon으로 바꾸고 VRM으로 내보낸다.
import bpy, os

OUT = os.path.expanduser('~/vtuber-wardrobe/out/blender-hanbok.vrm')
OUTFIT = bpy.data.collections['Outfit'].objects


def toon(m, alpha=None, tex=None):
    c = tuple(m.diffuse_color) if not tex else (1, 1, 1)   # enabled를 켜면 diffuse_color가 0.8로 바뀜
    t = m.vrm_addon_extension.mtoon1
    t.enabled = True
    t.pbr_metallic_roughness.base_color_factor = (c[0], c[1], c[2], alpha if alpha is not None else 1)
    t.alpha_mode = 'BLEND' if alpha is not None else 'OPAQUE'
    t.double_sided = True
    x = t.extensions.vrmc_materials_mtoon
    x.shade_color_factor = (c[0] * .86, c[1] * .74, c[2] * .82)
    x.shading_shift_factor = -.25
    x.shading_toony_factor = .75
    if tex:
        t.pbr_metallic_roughness.base_color_texture.index.source = tex
        x.shade_multiply_texture.index.source = tex
    x.outline_width_mode = 'worldCoordinates'
    x.outline_width_factor = .0006
    x.outline_color_factor = (c[0] * .45, c[1] * .3, c[2] * .35)


for name in ('Pink', 'Deep', 'White'):
    toon(bpy.data.materials[name])
atlas = bpy.data.images['outfit_atlas']
toon(bpy.data.materials['ClothTex'], None, atlas)
toon(bpy.data.materials['SheerTex'], 1.0, atlas)
_x = bpy.data.materials['SheerTex'].vrm_addon_extension.mtoon1
_x.extensions.vrmc_materials_mtoon.shade_color_factor = (.98, .95, .96)   # 비침 천 뒷면이 회색이 되지 않게
_x.extensions.vrmc_materials_mtoon.outline_width_mode = 'none'   # 투명 천은 외곽선 패스가 천 위에 겹쳐 그려져 자주색이 됨

# 시뮬레이션 틀은 안 내보냄
for n in ('Petti', 'BodyCol'):
    o = bpy.data.objects.get(n)
    if o:
        o.hide_set(True)
        o.hide_viewport = True
print(bpy.ops.export_scene.vrm(filepath=OUT, ignore_warning=True))
print(os.path.getsize(OUT) // 1024, 'KB')
