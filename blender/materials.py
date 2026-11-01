# 시험용 재질. 화면 색은 solid 보기(diffuse_color)와 노드 양쪽에 넣는다.
import bpy


def mat(name, rgb, alpha=1.0):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.diffuse_color = (*rgb, alpha)
    m.use_nodes = True
    p = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    p.inputs['Base Color'].default_value = (*rgb, 1)
    p.inputs['Roughness'].default_value = .75
    p.inputs['Alpha'].default_value = alpha
    if alpha < 1:
        m.surface_render_method = 'BLENDED'
    return m


def paint(o, m):
    o.data.materials.clear()
    o.data.materials.append(m)


PINK = (.93, .50, .60)
DEEP = (.80, .16, .33)
WHITE = (.96, .94, .94)
