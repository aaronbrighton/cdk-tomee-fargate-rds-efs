package org.sample.fargate.rds.efs.test;

import java.util.Map;

import javax.inject.Singleton;
import javax.ws.rs.GET;
import javax.ws.rs.Path;

import java.io.File;
import java.io.FileReader;
import java.io.FileWriter;   // Import the FileWriter class
import java.io.IOException;  // Import the IOException class to handle errors

/**
 * Append unique task/container information to a file on a shared filesystem, and print out file contents.
 */
@Path("/fs")
@Singleton
public class FsController {

    @GET
    public String response() {

        try {

            File sharedFile = new File("/staging/scratch.txt");

            FileWriter sharedFileWriter = new FileWriter("/staging/scratch.txt", true);
            sharedFileWriter.write("Container: "+System.getenv("HOSTNAME")+"<br />");
            sharedFileWriter.close();

            char[] fileContents = new char[sharedFile.exists() ? (int)sharedFile.length() : 100];

            FileReader sharedFileReader = new FileReader("/staging/scratch.txt");
            sharedFileReader.read(fileContents);
            sharedFileReader.close();

            return "Success writing file<br />"+String.valueOf(fileContents);

        } catch (IOException e) {

            e.printStackTrace();

            return "Failed to write/read file.";
            
        }
    }
}