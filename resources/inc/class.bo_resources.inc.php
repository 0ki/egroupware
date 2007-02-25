<?php
/**
 * eGroupWare - resources
 *
 * @license http://opensource.org/licenses/gpl-license.php GPL - GNU General Public License
 * @package resources
 * @link http://www.egroupware.org
 * @author Cornelius Weiss <egw@von-und-zu-weiss.de>
 * @author Lukas Weiss <wnz_gh05t@users.sourceforge.net>
 * @version $Id$
 */


/**
 * General business object for resources
 *
 * @package resources
 */
class bo_resources
{
	var $vfs_basedir = '/resources/';
	var $pictures_dir = '/resources/pictures/';
	var $thumbs_dir = '/resources/pictures/thumbs/';
	var $resource_icons = '/resources/templates/default/images/resource_icons/';
	var $debug = 0;
	
	function bo_resources()
	{
		$this->so =& CreateObject('resources.so_resources');
		$this->acl =& CreateObject('resources.bo_acl');
		$this->cats = $this->acl->egw_cats;
		$this->vfs =& CreateObject('phpgwapi.vfs');
		$this->link =& CreateObject('phpgwapi.bolink');
		$this->conf =& CreateObject('phpgwapi.config');
		$this->conf->read_repository();
		
		$this->cal_right_transform = array(	
			EGW_ACL_CALREAD 	=> EGW_ACL_READ,
			EGW_ACL_DIRECT_BOOKING 	=> EGW_ACL_READ | EGW_ACL_ADD | EGW_ACL_EDIT | EGW_ACL_DELETE,
			EGW_ACL_CAT_ADMIN 	=> EGW_ACL_READ | EGW_ACL_ADD | EGW_ACL_EDIT | EGW_ACL_DELETE,
		);
	}

	/**
	 * get rows for resources list
	 *
	 * Cornelius Weiss <egw@von-und-zu-weiss.de>
	 */
	function get_rows($query,&$rows,&$readonlys)
	{
		if ($this->debug) _debug_array($query);
		$query['search'] = $query['search'] ? $query['search'] : '*';
		$criteria = array('name' => $query['search'], 'short_description' => $query['search'], 'inventory_number' => $query['search']);
		$read_onlys = 'res_id,name,short_description,quantity,useable,bookable,buyable,cat_id,location,storage_info';
		
		$accessory_of = $query['view_accs_of'] ? $query['view_accs_of'] : -1;
 		$filter = array('accessory_of' => $accessory_of);
		if ($query['filter'])
		{
			$filter = $filter + array('cat_id' => $query['filter']);
		}
		else
		{
			$readcats = array_flip((array)$this->acl->get_cats(EGW_ACL_READ));
			if($readcats) $filter = $filter + array('cat_id' => $readcats);
		}
		if($query['show_bookable']) $filter = $filter + array('bookable' => true);
		$order_by = $query['order'] ? $query['order'].' '. $query['sort'] : '';
		$start = (int)$query['start'];
		
		$rows = $this->so->search($criteria,$read_onlys,$order_by,'','',$empty=False,$op='OR',$start,$filter,$join='',$need_full_no_count=false);
		$nr = $this->so->total;
		
		// we are called to serve bookable resources (e.g. calendar-dialog)
		if($query['show_bookable'])
		{
			// This is somehow ugly, i know...
			foreach((array)$rows as $num => $resource)
			{
				$rows[$num]['default_qty'] = 1;
			}
			// we don't need all the following testing
			return $nr;
		}
		
		foreach((array)$rows as $num => $resource)
		{
			if (!$this->acl->is_permitted($resource['cat_id'],EGW_ACL_EDIT))
			{
				$readonlys["edit[$resource[res_id]]"] = true;
			}
			if (!$this->acl->is_permitted($resource['cat_id'],EGW_ACL_DELETE))
			{
				$readonlys["delete[$resource[res_id]]"] = true;
			}
			if ((!$this->acl->is_permitted($resource['cat_id'],EGW_ACL_ADD)) || $accessory_of != -1)
			{
				$readonlys["new_acc[$resource[res_id]]"] = true;
			}
			if (!$resource['bookable'])
			{
				$readonlys["bookable[$resource[res_id]]"] = true;
				$readonlys["calendar[$resource[res_id]]"] = true;
			}
			if(!$this->acl->is_permitted($resource['cat_id'],EGW_ACL_CALREAD))
			{
				$readonlys["calendar[$resource[res_id]]"] = true;
			}
			if (!$resource['buyable'])
			{
				$readonlys["buyable[$resource[res_id]]"] = true;
			}
			$readonlys["view_acc[$resource[res_id]]"] = true;
			$links = $this->link->get_links('resources',$resource['res_id']);
			if(count($links) != 0 && $accessory_of == -1)
			{
				foreach ($links as $link_num => $link)
				{
					if($link['app'] == 'resources')
					{
						if($this->so->get_value('accessory_of',$link['res_id']) != -1)
						{
							$readonlys["view_acc[$resource[res_id]]"] = false;
						}
					}
				}
			}
			$rows[$num]['picture_thumb'] = $this->get_picture($resource['res_id']);
			$rows[$num]['admin'] = $this->acl->get_cat_admin($resource['cat_id']);
		}
		return $nr;
	}

	/**
	 * reads a resource exept binary datas
	 *
	 * Cornelius Weiss <egw@von-und-zu-weiss.de>
	 * @param int $res_id resource id
	 * @return array with key => value or false if not found or allowed
	 */
	function read($res_id)
	{
		if(!$this->acl->is_permitted($this->so->get_value('cat_id',$res_id),EGW_ACL_READ))
		{
			echo lang('You are not permitted to get information about this resource!') . '<br>';
			echo lang('Notify your administrator to correct this situation') . '<br>';
			return false;
		}
		return $this->so->read(array('res_id' => $res_id));
	}
	
	/**
	 * saves a resource. pictures are saved in vfs
	 *
	 * Cornelius Weiss <egw@von-und-zu-weiss.de>
	 * @param array $resource array with key => value of all needed datas
	 * @return string msg if somthing went wrong; nothing if all right
	 */
	function save($resource)
	{
		if(!$this->acl->is_permitted($resource['cat_id'],EGW_ACL_EDIT))
		{
			return lang('You are not permitted to edit this reource!');
		}
		
		// we need an id to save pictures and make links...
		if(!$resource['res_id'])
		{
			$resource['res_id'] = $this->so->save($resource);
		}

		switch ($resource['picture_src'])
		{
			case 'own_src':
				$vfs_data = array('string' => $this->pictures_dir.$resource['res_id'].'.jpg','relatives' => array(RELATIVE_ROOT));
				if($resource['own_file']['size'] > 0)
				{
					$msg = $this->save_picture($resource['own_file'],$resource['res_id']);
					break;
				}
				elseif($this->vfs->file_exists($vfs_data))
				{
					break;
				}
				$resource['picture_src'] = 'cat_src';
			case 'cat_src':
				break;
			case 'gen_src':
				$resource['picture_src'] = $resource['gen_src_list'];
				break;
			default:
				if($resource['own_file']['size'] > 0)
				{
					$resource['picture_src'] = 'own_src';
					$msg = $this->save_picture($resource['own_file'],$resource['res_id']);
				}
				else
				{
					$resource['picture_src'] = 'cat_src';
				}
		}
		// somthing went wrong on saving own picture
		if($msg)
		{
			return $msg;
		}
		
		// delete old pictures
		if($resource['picture_src'] != 'own_src')
		{
			$this->remove_picture($resource['res_id']);
		}

		// save links
		if(is_array($resource['link_to']['to_id']))
		{
			$this->link->link('resources',$resource['res_id'],$resource['link_to']['to_id']);
		}
		if($resource['accessory_of'] != -1)
		{
			$this->link->link('resources',$resource['res_id'],'resources',$resource['accessory_of']);
		}
		
		if(!empty($resource['res_id']) && $this->so->get_value("cat_id",$resource['res_id']) != $resource['cat_id'] && $resource['accessory_of'] == -1)
		{
			$accessories = $this->get_acc_list($resource['res_id']);
			foreach($accessories as $accessory => $name)
			{
				$acc = $this->so->read($accessory);
				$acc['cat_id'] = $resource['cat_id'];
				$this->so->data = $acc;
				$this->so->save();
			}
		}
		
		return $this->so->save($resource) ? false : lang('Something went wrong by saving resource');
	}

	/**
	 * deletes resource including pictures and links
	 *
	 * @author Lukas Weiss <wnz_gh05t@users.sourceforge.net>
	 * @param int $res_id id of resource
	 */
	function delete($res_id)
	{
		if(!$this->acl->is_permitted($this->so->get_value('cat_id',$res_id),EGW_ACL_DELETE))
		{
			return lang('You are not permitted to delete this reource!');
		}
		
		if ($this->so->delete(array('res_id'=>$res_id)))
		{
			$this->remove_picture($res_id);
	 		$this->link->unlink(0,'resources',$res_id);
	 		// delete the resource from the calendar
	 		ExecMethod('calendar.socal.change_delete_user','r'.$res_id);
	 		return false;
		}
		return lang('Something went wrong by deleting resource');
	}
	
	/**
	 * gets list of accessories for resource
	 *
	 * Cornelius Weiss <egw@von-und-zu-weiss.de>
	 * @param int $res_id id of resource
	 * @return array
	 */
	function get_acc_list($res_id)
	{
		if($res_id < 1){return;}
		$data = $this->so->search('','res_id,name','','','','','',$start,array('accessory_of' => $res_id),'',$need_full_no_count=true);
		foreach($data as $num => $resource)
		{
			$acc_list[$resource['res_id']] = $resource['name'];
		}
		return $acc_list;
	}
	
	/**
	 * returns info about resource for calender
	 * @author Cornelius Weiss<egw@von-und-zu-weiss.de>
	 * @param int/array $res_id single id or array $num => $res_id
	 * @return array 
	 */
	function get_calendar_info($res_id)
	{
		//echo "<p>bo_resources::get_calendar_info(".print_r($res_id,true).")</p>\n";
		if(!is_array($res_id) && $res_id < 1) return;

		$data = $this->so->search(array('res_id' => $res_id),'res_id,cat_id,name,useable');
		
		foreach($data as $num => $resource)
		{
			$data[$num]['rights'] = false;
			foreach($this->cal_right_transform as $res_right => $cal_right)
			{
				if($this->acl->is_permitted($resource['cat_id'],$res_right))
				{
					$data[$num]['rights'] = $cal_right;
				}
			}
			$data[$num]['responsible'] = $this->acl->get_cat_admin($resource['cat_id']);
		}
		return $data;
	}
	
	/**
	 * returns status for a new calendar entry depending on resources ACL
	 * @author Cornelius Weiss <egw@von-und-zu-weiss.de>
	 * @param int $res_id single id
	 * @return array 
	 */
	function get_calendar_new_status($res_id)
	{
		$data = $this->so->search(array('res_id' => $res_id),'res_id,cat_id,bookable');
		if($data[0]['bookable'] == 0) return 'x';
		return $this->acl->is_permitted($data[0]['cat_id'],EGW_ACL_DIRECT_BOOKING) ? A : U;
	}
	
	/**
	 * @author Cornelius Weiss <egw@von-und-zu-weiss.de>
	 * query infolog for entries matching $pattern
	 *
	 */
	function link_query( $pattern )
	{
		$criteria = array('name' => $pattern, 'short_description' => $pattern);
		$only_keys = 'res_id,name,short_description';
		$filter = array(
			'cat_id' => array_flip((array)$this->acl->get_cats(EGW_ACL_READ)),
			//'accessory_of' => '-1'
		);
		$data = $this->so->search($criteria,$only_keys,$order_by='',$extra_cols='',$wildcard='%',$empty,$op='OR','',$filter);
		foreach($data as $num => $resource)
		{
			if($num != 0)
			{
				$list[$resource['res_id']] = $resource['name']. ($resource['short_description'] ? ', ['.$resource['short_description'].']':'');
			}
		}
		return $list;
	}
		
	/**
	 * @author Cornelius Weiss <egw@von-und-zu-weiss.de>
	 * get title for an infolog entry identified by $res_id
	 *
	 * @return string/boolean string with title, null if resource does not exist or false if no perms to view it
	 */
	function link_title( $resource )
	{
		if (!is_array($resource))
		{
			if (!($resource  = $this->so->read(array('res_id' => $resource)))) return null;
		}
		if(!$this->acl->is_permitted($resource['cat_id'],EGW_ACL_READ)) return false;

		return $resource['name']. ($resource['short_description'] ? ', ['.$resource['short_description'].']':'');
	}
	
	/**
	 * resizes and saves an pictures in vfs
	 *
	 * Cornelius Weiss <egw@von-und-zu-weiss.de>
	 * @param array $file array with key => value
	 * @param int $resource_id
	 * @return mixed string with msg if somthing went wrong; nothing if all right
	 * TODO make thumb an picture sizes choosable by preferences
	 */	
	function save_picture($file,$resouce_id)
	{
		// test upload dir
		$vfs_data = array('string'=>$this->vfs_basedir,'relatives'=>array(RELATIVE_ROOT));
		if (!($this->vfs->file_exists($vfs_data)))
		{
			$this->vfs->override_acl = 1;
			$this->vfs->mkdir($vfs_data);
			$vfs_data['string'] = $this->pictures_dir;
			$this->vfs->mkdir($vfs_data);
			$vfs_data['string'] = $this->thumbs_dir;
			$this->vfs->mkdir($vfs_data);
			$this->vfs->override_acl = 0;
		}
		
		switch($file['type'])
		{
			case 'image/gif':
				$src_img = imagecreatefromgif($file['tmp_name']);
				break;
			case 'image/jpeg':
			case 'image/pjpeg':
				$src_img = imagecreatefromjpeg($file['tmp_name']);
				break;
			case 'image/png':
			case 'image/x-png':
				$src_img = imagecreatefrompng($file['tmp_name']);
				break;
			default:
				return lang('Picture type is not supported, sorry!');
		}
		
		$src_img_size = getimagesize($file['tmp_name']);
		$dst_img_size = array( 0 => 320, 1 => 240);
		$thumb_size = array( 0 => 64, 1 => 48);
		
		$tmp_dir = $GLOBALS['egw_info']['server']['temp_dir'].'/';
		if($src_img_size[0] > 64 || $src_img_size[1] > 48)
		{
			$f = $thumb_size[0] / $src_img_size[0];
			$f = $thumb_size[1] / $src_img_size[1] < $f ? $thumb_size[1] / $src_img_size[1] : $f;
			$dst_img = imagecreatetruecolor($src_img_size[0] * $f, $src_img_size[1] * $f);
			imagecopyresized($dst_img,$src_img,0,0,0,0,$src_img_size[0] * $f,$src_img_size[1] * $f,$src_img_size[0],$src_img_size[1]);
			imagejpeg($dst_img,$tmp_dir.$resouce_id.'.thumb.jpg');
			if($src_img_size[0] > $dst_img_size[0] || $src_img_size[1] > $dst_img_size[1])
			{
				$f = $dst_img_size[0] / $src_img_size[0];
				$f = $dst_img_size[1] / $src_img_size[1] < $f ? $dst_img_size[1] / $src_img_size[1] : $f;
				$dst_img = imagecreatetruecolor($src_img_size[0] * $f, $src_img_size[1] * $f);
				imagecopyresized($dst_img,$src_img,0,0,0,0,$src_img_size[0] * $f,$src_img_size[1] * $f,$src_img_size[0],$src_img_size[1]);
				imagejpeg($dst_img,$tmp_dir.$resouce_id.'.jpg');
			}
			else
			{
				imagejpeg($src_img,$tmp_dir.$resouce_id.'.jpg');
			}
			imagedestroy($dst_img);
		}
		else
		{
				imagejpeg($src_img,$tmp_dir.$resouce_id.'.jpg');
				imagejpeg($src_img,$tmp_dir.$resouce_id.'.thumb.jpg');
		}
		imagedestroy($src_img);
			
		$this->vfs->override_acl = 1;
		$this->vfs->cp(array(
			'from' => $tmp_dir.$resouce_id.'.jpg',
			'to'   => $this->pictures_dir.$resouce_id.'.jpg',
			'relatives' => array(RELATIVE_NONE|VFS_REAL,RELATIVE_ROOT)
		));
		$this->vfs->set_attributes(array(
			'string' => $this->pictures_dir.$resouce_id.'.jpg',
			'relatives' => array (RELATIVE_ROOT),
			'attributes' => array (
				'mime_type' => 'image/jpeg',
				'comment' => 'picture of resource no.'.$resouce_id,
				'app' => $GLOBALS['egw_info']['flags']['currentapp']
		)));
		$this->vfs->cp(array(
			'from' => $tmp_dir.$resouce_id.'.thumb.jpg',
			'to'   => $this->thumbs_dir.$resouce_id.'.jpg',
			'relatives' => array(RELATIVE_NONE|VFS_REAL,RELATIVE_ROOT)
			));
		$this->vfs->set_attributes(array(
			'string' => $this->thumbs_dir.$resouce_id.'.jpg',
			'relatives' => array (RELATIVE_ROOT),
			'attributes' => array (
				'mime_type' => 'image/jpeg',
				'comment' => 'thumbnail of resource no.'.$resouce_id,
				'app' => $GLOBALS['egw_info']['flags']['currentapp']
		)));
		$this->vfs->override_acl = 0;
		return;
	}
	
	/**
	 * get resource picture either from vfs or from symlink
	 * Cornelius Weiss <egw@von-und-zu-weiss.de>
	 * @param int $res_id id of resource
	 * @param bool $size false = thumb, true = full pic
	 * @return string url of picture
	 */
	function get_picture($res_id=0,$size=false)
	{
		if ($res_id > 0)
		{
			$src = $this->so->get_value('picture_src',$res_id);
		}
		switch($src)
		{
			case 'own_src':
				$picture = $this->conf->config_data['dont_use_vfs'] ? $GLOBALS['egw_info']['server']['webserver_url'] : 'vfs:';
				$picture .= $size ? $this->pictures_dir.$res_id.'.jpg' : $this->thumbs_dir.$res_id.'.jpg';
				break;
			case 'cat_src':
				list($picture) = $this->cats->return_single($this->so->get_value('cat_id',$res_id));
				$picture = unserialize($picture['data']);
				if($picture['icon'])
				{
					$picture = $GLOBALS['egw_info']['server']['webserver_url'].'/phpgwapi/images/'.$picture['icon'];
					break;
				}
			case 'gen_src':
			default :
				$picture = $GLOBALS['egw_info']['server']['webserver_url'].$this->resource_icons;
				$picture .= strstr($src,'.') ? $src : 'generic.png';
		}
		return $picture;
	}
	
	/**
	 * remove_picture
	 * removes picture from vfs
	 *
	 * Cornelius Weiss <egw@von-und-zu-weiss.de>
	 * @param int $res_id id of resource
	 * @return bool succsess or not
	 */
	function remove_picture($res_id)
	{
		$vfs_data = array('string' => $this->pictures_dir.$res_id.'.jpg','relatives' => array(RELATIVE_ROOT));
		$this->vfs->override_acl = 1;
		if($this->vfs->file_exists($vfs_data))
		{
			$this->vfs->rm($vfs_data);
			$vfs_data['string'] = $this->thumbs_dir.$res_id.'.jpg';
			$this->vfs->rm($vfs_data);
		}
		$this->vfs->override_acl = 0;
	}

	/**
	 * get_genpicturelist
	 * gets all pictures from 'generic picutres dir' in selectbox style for eTemplate
	 *
	 * Cornelius Weiss <egw@von-und-zu-weiss.de>
	 * @return array directory contens in eTemplates selectbox style
	 */
	function get_genpicturelist()
	{
		$icons['generic.png'] = lang('gernal resource');
		$dir = dir(EGW_SERVER_ROOT.$this->resource_icons);
		while($file = $dir->read())
		{
			if (preg_match('/\\.(png|gif|jpe?g)$/i',$file) && $file != 'generic.png')
			{
				$icons[$file] = substr($file,0,strpos($file,'.'));
			}
		}
		$dir->close();
		return $icons;
	}
}
