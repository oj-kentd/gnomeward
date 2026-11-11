"""Sporewatch: Aster + Morel plush fusion, made entirely in Blender.
Run: blender --background --threads 6 --python art/generate_sporewatch.py
Only creates this fusion's GLB, portrait, preview, and editable source.
"""
from pathlib import Path
shared=Path(__file__).with_name('generate_fusions.py').read_text()
exec(compile(shared.split('\nassets={}')[0],str(Path(__file__).with_name('generate_fusions.py')),'exec'))
mat('watch-blue',(.11,.30,.64),rough=.85)
mat('watch-violet',(.49,.19,.67),rough=.87)
mat('watch-spot',(.93,.88,.70),rough=.9)

def mushroom(x,y,z,size):
    rod('Mushroom ivory stem',(x,y,z),(x,y,z+size*.72),size*.16,'watch-spot')
    uv('Purple velvet mushroom cap',(x,y,z+size*.78),(size*.65,size*.57,size*.32),'watch-violet',24,14)
    uv('Cream cap underside',(x,y,z+size*.68),(size*.57,size*.49,size*.06),'watch-spot',16,10)
    for dx,dy in [(-.28,-.10),(.23,-.22),(.22,.23),(-.18,.24)]:
        uv('Cream mushroom cap spot',(x+dx*size,y+dy*size,z+size*1.03),(size*.09,size*.08,size*.03),'watch-spot',12,8)

reset();body('sniper-spore',['watch-blue','watch-violet'])
# Aster's long rifle with a mushroom scope and the Morel staff in the other hand.
cube('Long padded precision rifle',(.41,-.34,.64),(.16,.73,.16),'watch-blue',.027)
rod('Long golden rifle barrel',(.41,-.50,.64),(.41,-.86,.64),.041,'gold')
cube('Purple padded rifle stock',(.41,-.13,.51),(.10,.17,.25),'watch-violet',.025)
rod('Violet scope',(.41,-.21,.79),(.41,-.46,.79),.046,'watch-violet')
ring=torus('Purple precision muzzle',(.41,-.86,.64),.061,.017,'watch-violet');ring.rotation_euler.x=math.pi/2
uv('Cyan scope lens',(.41,-.466,.79),(.033,.009,.033),'crystal',12,8)
rod('Morel walking staff',(-.43,-.10,.20),(-.43,-.10,.97),.033,'wood')
mushroom(-.43,-.10,.93,.31)
# A tiny mushroom sprouts from the hat, above embroidered cream cap spots.
mushroom(.20,-.01,1.39,.19)
for x,y,z in [(-.16,-.27,1.04),(.10,-.25,1.15),(.12,-.16,1.30)]:
    uv('Ivory hat spore stitch',(x,y,z),(.027,.013,.024),'watch-spot',12,8)
mushroom(-.25,-.23,.26,.15)
obj=grounded_export('gnome-fusion-sniper-spore')
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=True
scene.render.image_settings.file_format='PNG';scene.render.film_transparent=True
scene.render.resolution_x=320;scene.render.resolution_y=320;scene.render.resolution_percentage=100
scene.world.color=(.35,.35,.35);scene.view_settings.view_transform='AgX'
for name,loc,power,size in [('Warm softbox',(-3,-4,5),380,4),('Cool fill',(3,-1,3),220,3),('Rim light',(1,3,4),450,3)]:
    bpy.ops.object.light_add(type='AREA',location=loc);light=bpy.context.object;light.name=name;light.data.energy=power;light.data.shape='DISK';light.data.size=size;light.rotation_euler=(Vector((0,0,.7))-light.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=(2.3,-5,2.8));cam=bpy.context.object;cam.rotation_euler=(Vector((0,-.12,.78))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=2.22;scene.camera=cam
obj.hide_render=False;obj.hide_set(False)
scene.render.filepath=os.path.join(OUT,'fusion-sniper-spore.png');bpy.ops.render.render(write_still=True)
scene.render.resolution_x=850;scene.render.resolution_y=850
scene.render.filepath=os.path.join(ROOT,'art','sporewatch-preview.png');bpy.ops.render.render(write_still=True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT,'art','sporewatch.blend'),compress=True)
print('GNOMEWARD_SPOREWATCH_COMPLETE')
